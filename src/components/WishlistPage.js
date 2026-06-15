import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getWishlist, removeWishlistItem } from "../utils";
import "./AccountPage.css"; // reuse the dark shell + top bar styles
import "./WishlistPage.css";

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
  });
};

function WishlistPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const email = session && session.user && session.user.email;

  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(true);

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Load this user's wishlist (RLS scopes it to the signed-in account).
  useEffect(() => {
    if (!email) return undefined;
    let active = true;
    setFetching(true);
    getWishlist().then((list) => {
      if (!active) return;
      setItems(list);
      setFetching(false);
    });
    return () => {
      active = false;
    };
  }, [email]);

  const handleRemove = async (id) => {
    await removeWishlistItem(id);
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
        <span className="account-topbar-title">Wishlist</span>
      </header>

      <main className="account-main">
        <section className="wl-wrap" aria-label="Wishlist">
          <h1 className="wl-heading">Your Wishlist 🐕</h1>

          {fetching ? (
            <p className="wl-loading">Fetching your wishlist…</p>
          ) : items.length === 0 ? (
            <div className="wl-empty">
              <div className="wl-empty-icon" aria-hidden="true">♡</div>
              <p className="wl-empty-title">
                No items in your wishlist yet. Ask FetchIt to save something for
                you!
              </p>
              <button className="btn btn-primary" onClick={() => navigate("/chat")}>
                Start Shopping
              </button>
            </div>
          ) : (
            <ul className="wl-list">
              {items.map((item) => (
                <li key={item.id} className="wl-card">
                  <div className="wl-thumb" aria-hidden="true">
                    {item.productImage || "🛍️"}
                  </div>
                  <div className="wl-body">
                    <h2 className="wl-name">{item.productName}</h2>
                    <p className="wl-meta">
                      {item.retailer && <span>{item.retailer}</span>}
                      <span>Added {formatDate(item.createdAt)}</span>
                    </p>
                    {item.notes && <p className="wl-notes">{item.notes}</p>}
                    <div className="wl-price">{money(item.price)}</div>
                  </div>
                  <button
                    className="wl-remove"
                    onClick={() => handleRemove(item.id)}
                    aria-label={`Remove ${item.productName} from wishlist`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default WishlistPage;
