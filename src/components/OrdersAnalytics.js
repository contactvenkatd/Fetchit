import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  getOrders,
  spendSummary,
  categoryBreakdown,
  SPEND_PERIODS,
} from "../utils";
import "./AccountPage.css"; // reuse the dark shell + top bar styles
import "./OrdersAnalytics.css";

const money = (n) =>
  typeof n === "number" && Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// pending | processing | completed | failed → a CSS modifier + label.
const STATUS = {
  pending: { cls: "pending", label: "Pending" },
  processing: { cls: "processing", label: "Processing" },
  completed: { cls: "completed", label: "Completed" },
  failed: { cls: "failed", label: "Failed" },
};
const statusInfo = (s) =>
  STATUS[(s || "").toLowerCase()] || { cls: "completed", label: s || "—" };

function OrdersAnalytics() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const email = session && session.user && session.user.email;

  const [orders, setOrders] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [period, setPeriod] = useState("lifetime");

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Load this user's orders (RLS scopes them to the signed-in account).
  useEffect(() => {
    if (!email) return undefined;
    let active = true;
    setFetching(true);
    getOrders().then((list) => {
      if (!active) return;
      setOrders(list);
      setFetching(false);
    });
    return () => {
      active = false;
    };
  }, [email]);

  const summary = useMemo(() => spendSummary(orders), [orders]);
  const breakdown = useMemo(
    () => categoryBreakdown(orders, period),
    [orders, period]
  );
  const maxCat = breakdown.length ? breakdown[0].total : 0;

  if (loading || !session) return null;

  return (
    <div className="account-page">
      <header className="account-topbar">
        <button
          className="account-back"
          onClick={() => navigate("/chat")}
          aria-label="Back to chat"
        >
          ←
        </button>
        <a href="/" className="logo">
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </a>
        <span className="account-topbar-title">Orders &amp; Analytics</span>
      </header>

      <main className="account-main">
        <div className="oa-grid">
          {/* ---------- LEFT: analytics ---------- */}
          <section className="oa-analytics" aria-label="Spending analytics">
            <h1 className="oa-heading">Your Spending 🐕</h1>

            <div className="spend-cards">
              {SPEND_PERIODS.map((p) => (
                <div key={p.key} className={`spend-card spend-card-${p.key}`}>
                  <span className="spend-card-label">{p.label}</span>
                  <span className="spend-card-amount">
                    {money(summary[p.key] || 0)}
                  </span>
                </div>
              ))}
            </div>

            <div className="breakdown-panel">
              <h2 className="breakdown-title">Category breakdown</h2>
              <div className="breakdown-tabs" role="tablist">
                {SPEND_PERIODS.map((p) => (
                  <button
                    key={p.key}
                    role="tab"
                    aria-selected={period === p.key}
                    className={`breakdown-tab${period === p.key ? " active" : ""}`}
                    onClick={() => setPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {breakdown.length === 0 ? (
                <p className="breakdown-empty">No spending in this period yet.</p>
              ) : (
                <ul className="breakdown-list">
                  {breakdown.map((c) => (
                    <li key={c.category} className="breakdown-row">
                      <div className="breakdown-row-top">
                        <span className="breakdown-cat">{c.category}</span>
                        <span className="breakdown-amt">{money(c.total)}</span>
                      </div>
                      <div className="breakdown-bar">
                        <div
                          className="breakdown-bar-fill"
                          style={{
                            width: `${maxCat ? (c.total / maxCat) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ---------- RIGHT: order history ---------- */}
          <section className="oa-history" aria-label="Order history">
            <h1 className="oa-heading">Order History</h1>

            {fetching ? (
              <p className="orders-loading">Fetching your orders…</p>
            ) : orders.length === 0 ? (
              <div className="orders-empty">
                <div className="orders-empty-dog" aria-hidden="true">🛍️</div>
                <p className="orders-empty-title">No orders yet — start shopping!</p>
                <button className="btn btn-primary" onClick={() => navigate("/chat")}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <ul className="orders-list oa-orders">
                {orders.map((o) => {
                  const s = statusInfo(o.status);
                  return (
                    <li key={o.id} className="order-card">
                      <div className="order-thumb" aria-hidden="true">
                        {o.productImage || "🛍️"}
                      </div>
                      <div className="order-body">
                        <div className="order-top">
                          <h2 className="order-name">{o.productName}</h2>
                          <span className={`order-status order-status-${s.cls}`}>
                            {s.label}
                          </span>
                        </div>
                        <p className="order-meta">
                          {o.retailer && <span>{o.retailer}</span>}
                          {o.category && <span>{o.category}</span>}
                          <span>{formatDate(o.createdAt)}</span>
                        </p>
                        <div className="order-prices">
                          <span className="order-price">{money(o.orderPrice)}</span>
                          <span className="order-fee">
                            + {money(o.serviceFee)} FetchIt fee
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default OrdersAnalytics;
