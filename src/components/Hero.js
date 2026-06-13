import "./Hero.css";

function Hero({ onSeeHow }) {
  return (
    <section className="hero" id="top">
      <div className="container hero-inner">
        <img
          src="/fetchit-logo.png"
          alt="FetchIt — your shopping best friend"
          className="hero-logo"
        />
        <span className="badge">🦴 Your AI shopping best friend</span>
        <h1>Shop Smarter. Fetch Faster.</h1>
        <p>
          Tell FetchIt what you want. It searches Amazon, Walmart, Target, Best
          Buy, AliExpress and more — then buys it for you automatically.
        </p>
        <div className="hero-retailers" aria-label="Shops from Amazon, Walmart, Target, Best Buy, Costco, Home Depot, Lowe's, AliExpress">
          <span className="hero-retailers-label">Shops from:</span>
          <ul className="retailer-badges">
            {[
              "Amazon",
              "Walmart",
              "Target",
              "Best Buy",
              "Costco",
              "Home Depot",
              "Lowe's",
              "AliExpress",
            ].map((r) => (
              <li className="retailer-badge" key={r}>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <span className="hero-grok">
          Powered by Grok 4.3 — xAI&apos;s advanced reasoning model
        </span>
        <p className="hero-skus">
          Access to over 20 million SKUs across all retailers
        </p>
        <div className="hero-secondary">
          <button className="btn btn-primary" onClick={onSeeHow}>
            See How It Works
          </button>
        </div>
        <p className="hero-note">Free to start · No credit card needed</p>
      </div>
    </section>
  );
}

export default Hero;
