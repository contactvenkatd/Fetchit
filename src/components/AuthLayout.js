import { Link } from "react-router-dom";
import "./AuthLayout.css";

function AuthLayout({ children, width = "narrow" }) {
  return (
    <div className="auth-page">
      <div className={`auth-wrap auth-${width}`}>
        <Link to="/" className="auth-logo logo">
          <span className="logo-mark" role="img" aria-label="Fetchit dog">
            🐕
          </span>
          <span className="logo-text">Fetchit</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
