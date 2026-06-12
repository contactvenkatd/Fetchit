import { useState } from "react";
import { getSignups, clearSignups } from "../utils";
import "./AdminPage.css";

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminPage() {
  const [signups, setSignups] = useState(() => getSignups());

  const handleClear = () => {
    if (window.confirm("Clear all signups? This cannot be undone.")) {
      clearSignups();
      setSignups([]);
    }
  };

  return (
    <div className="admin">
      <div className="admin-inner">
        <header className="admin-head">
          <a href="/" className="logo">
            <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
          </a>
          <span className="admin-tag">Admin · Signups</span>
        </header>

        <div className="admin-bar">
          <p className="admin-count">
            {signups.length} signup{signups.length === 1 ? "" : "s"}
          </p>
          <button
            className="btn btn-dark admin-clear"
            onClick={handleClear}
            disabled={signups.length === 0}
          >
            Clear All
          </button>
        </div>

        {signups.length === 0 ? (
          <p className="admin-empty">
            No signups yet. 🦴 They&apos;ll appear here as people join.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s, i) => (
                  <tr key={`${s.email}-${s.timestamp}-${i}`}>
                    <td>{i + 1}</td>
                    <td>{s.email}</td>
                    <td>
                      <span className="plan-pill">{s.plan}</span>
                    </td>
                    <td>{formatDate(s.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPage;
