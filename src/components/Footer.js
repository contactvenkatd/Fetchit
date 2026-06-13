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
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </div>
        <p className="footer-tagline">FetchIt — your shopping best friend 🦴</p>
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
          <a href="/tos">Terms of Service</a>
          <a href="/privacy-policy">Privacy Policy</a>
        </nav>
        <p className="footer-copy">
          © 2026 FetchIt. Made with 🧡 for happy shoppers.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
