import "./HowItWorks.css";

const STEPS = [
  {
    emoji: "💬",
    title: "Chat with FetchIt AI",
    text: "Describe what you need in plain English. FetchIt asks smart follow-up questions to nail down exactly what you want.",
  },
  {
    emoji: "🛍️",
    title: "Pick from AI-Curated Recommendations",
    text: "FetchIt surfaces the best matching products with real reviews, photos, and prices. You choose what you like.",
  },
  {
    emoji: "🛒",
    title: "FetchIt Buys It For You",
    text: "Click buy. FetchIt handles the checkout automatically in the background. You get a confirmation.",
  },
];

function HowItWorks() {
  return (
    <section className="block" id="how">
      <div className="container">
        <div className="section-head">
          <h2>How It Works</h2>
          <p>Three easy steps from wish to doorstep.</p>
        </div>
        <div className="steps">
          {STEPS.map((step, i) => (
            <div className="step" key={step.title}>
              <div className="step-emoji">{step.emoji}</div>
              <div className="step-num">{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
