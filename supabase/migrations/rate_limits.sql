-- Per-IP (and general per-bucket) rate limiting for edge functions.
-- Run once in the Supabase SQL editor (or via `supabase db push`).
--
-- rl_check(bucket, limit, window_seconds) atomically increments the counter for
-- the current fixed window and returns false once the bucket exceeds the limit.
-- It's SECURITY DEFINER and execute is revoked from public/anon/authenticated so
-- only the service role (used by the edge functions) can call it.

create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.rl_check(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.rl_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rl_check(text, integer, integer) to service_role;
