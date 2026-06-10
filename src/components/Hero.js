import "./Hero.css";

function Hero({ onSeeHow }) {
  return (
    <section className="hero" id="top">
      <div className="container hero-inner">
        <span className="badge">🦴 Your AI shopping best friend</span>
        <h1>Just Tell Fetchit What You Want</h1>
        <p>
          Chat with Fetchit&apos;s AI, get personalized product picks with
          reviews, and let Fetchit buy it for you — automatically.
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
