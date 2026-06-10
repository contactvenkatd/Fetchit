import "./Features.css";

const FEATURES = [
  {
    icon: "💬",
    title: "Conversational AI",
    text: "Shop by describing what you want in natural language, no search bars needed.",
  },
  {
    icon: "⭐",
    title: "Smart Recommendations",
    text: "Real product picks with photos, prices, and verified reviews.",
  },
  {
    icon: "🛒",
    title: "Auto Checkout",
    text: "Puppeteer-powered background checkout so you never fill a form again.",
  },
  {
    icon: "🔒",
    title: "Secure Payments",
    text: "Stripe-powered, your card details are never stored on our servers.",
  },
];

function Features() {
  return (
    <section className="block features-block" id="features">
      <div className="container">
        <div className="section-head">
          <h2>Everything Fetchit Fetches</h2>
          <p>A whole pack of smart shopping tools.</p>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Features;
