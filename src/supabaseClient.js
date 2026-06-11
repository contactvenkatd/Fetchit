// Supabase client — single shared instance for the whole app.
// Auth sessions persist in localStorage and are auto-refreshed; the email
// confirmation link is detected on page load via detectSessionInUrl.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fpphpncruohjlppqhfep.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_j_SnlL8-OiV_ha4pWL1lHw_AQCmalXg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
