import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  getAutoReorders,
  setAutoReorderActive,
  deleteAutoReorder,
  frequencyLabel,
} from "../utils";
import "./AccountPage.css"; // reuse the dark shell + top bar styles
import "./AutoReorderPage.css";

const money = (n) =>
  typeof n === "number" && Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function AutoReorderPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const email = session && session.user && session.user.email;

  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(true);

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Load this user's auto-reorders (RLS scopes them to the signed-in account).
  useEffect(() => {
    if (!email) return undefined;
    let active = true;
    setFetching(true);
    getAutoReorders().then((list) => {
      if (!active) return;
      setItems(list);
      setFetching(false);
    });
    return () => {
      active = false;
    };
  }, [email]);

  const handleToggle = async (item) => {
    const nextActive = !item.active;
    // Optimistic flip; revert on error.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, active: nextActive } : i))
    );
    const { error } = await setAutoReorderActive(item.id, nextActive);
    if (error) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i))
      );
    }
  };

  const handleDelete = async (id) => {
    await deleteAutoReorder(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

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
        <span className="account-topbar-title">Auto-Reorder</span>
      </header>

      <main className="account-main">
        <section className="ar-wrap" aria-label="Auto-reorders">
          <h1 className="ar-heading">Auto-Reorders 🔁</h1>

          {fetching ? (
            <p className="ar-loading">Fetching your auto-reorders…</p>
          ) : items.length === 0 ? (
            <div className="ar-empty">
              <div className="ar-empty-icon" aria-hidden="true">🔁</div>
              <p className="ar-empty-title">
                No auto-reorders set up yet. Ask FetchIt to set one up for you!
              </p>
              <button className="btn btn-primary" onClick={() => navigate("/chat")}>
                Start Shopping
              </button>
            </div>
          ) : (
            <ul className="ar-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`ar-card${item.active ? "" : " is-paused"}`}
                >
                  <div className="ar-thumb" aria-hidden="true">
                    {item.productImage || "🛍️"}
                  </div>
                  <div className="ar-body">
                    <h2 className="ar-name">{item.productName}</h2>
                    <p className="ar-meta">
                      <span className="ar-freq">
                        {frequencyLabel(item.frequency)}
                      </span>
                      {item.price != null && <span>{money(item.price)}</span>}
                    </p>
                    <p className="ar-next">
                      {item.active ? (
                        <>Next order: {formatDate(item.nextOrderDate)}</>
                      ) : (
                        <span className="ar-paused-label">Paused</span>
                      )}
                    </p>
                  </div>
                  <div className="ar-actions">
                    <button
                      className={`ar-toggle${item.active ? " active" : ""}`}
                      role="switch"
                      aria-checked={item.active}
                      onClick={() => handleToggle(item)}
                      aria-label={
                        item.active
                          ? `Pause auto-reorder for ${item.productName}`
                          : `Resume auto-reorder for ${item.productName}`
                      }
                    >
                      <span className="ar-toggle-knob" />
                    </button>
                    <button
                      className="ar-delete"
                      onClick={() => handleDelete(item.id)}
                      aria-label={`Delete auto-reorder for ${item.productName}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default AutoReorderPage;
