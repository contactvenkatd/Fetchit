import { Link } from "react-router-dom";
import "./AuthLayout.css";

function AuthLayout({ children, width = "narrow" }) {
  return (
    <div className="auth-page">
      <div className={`auth-wrap auth-${width}`}>
        <Link to="/" className="auth-logo logo">
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </Link>
        {children}
      </div>
    </div>
  );
}

export default AuthLayout;
