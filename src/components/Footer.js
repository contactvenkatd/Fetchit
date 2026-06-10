import "./Footer.css";

function Footer({ onNavigate }) {
  const handleNav = (e, id) => {
    e.preventDefault();
    onNavigate(id);
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-logo logo">
          <span className="logo-mark" role="img" aria-label="Fetchit dog">
            🐕
          </span>
          <span className="logo-text">Fetchit</span>
        </div>
        <p className="footer-tagline">Fetchit — your shopping best friend 🦴</p>
        <nav className="footer-links">
          <a href="#how" onClick={(e) => handleNav(e, "how")}>
            How It Works
          </a>
          <a href="#features" onClick={(e) => handleNav(e, "features")}>
            Features
          </a>
          <a href="#pricing" onClick={(e) => handleNav(e, "pricing")}>
            Pricing
          </a>
          <a href="#faq" onClick={(e) => handleNav(e, "faq")}>
            FAQ
          </a>
        </nav>
        <p className="footer-copy">
          © 2026 Fetchit. Made with 🧡 for happy shoppers.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
