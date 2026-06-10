import { useState } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";

function Navbar({ onNavigate }) {
  const [open, setOpen] = useState(false);

  const handleNav = (e, id) => {
    e.preventDefault();
    onNavigate(id);
    setOpen(false);
  };

  return (
    <header className="navbar">
      <div className="container nav">
        <a href="#top" className="logo" onClick={(e) => handleNav(e, "top")}>
          <span className="logo-mark" role="img" aria-label="Fetchit dog">
            🐕
          </span>
          <span className="logo-text">Fetchit</span>
        </a>

        <button
          className={`hamburger${open ? " is-open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="primary-nav"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav id="primary-nav" className={`nav-links${open ? " is-open" : ""}`}>
          <a href="#how" onClick={(e) => handleNav(e, "how")}>
            How It Works
          </a>
          <a href="#features" onClick={(e) => handleNav(e, "features")}>
            Features
          </a>
          <a href="#pricing" onClick={(e) => handleNav(e, "pricing")}>
            Pricing
          </a>
          <Link
            to="/login"
            className="nav-signin"
            onClick={() => setOpen(false)}
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="btn btn-primary nav-cta"
            onClick={() => setOpen(false)}
          >
            Create Account
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
