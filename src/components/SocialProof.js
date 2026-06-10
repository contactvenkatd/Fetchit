import "./SocialProof.css";

const STATS = [
  { num: "50,000+", label: "Happy shoppers" },
  { num: "$2.4M", label: "Saved this month" },
  { num: "99.8%", label: "Satisfaction" },
];

function SocialProof() {
  return (
    <section className="block proof-block">
      <div className="container">
        <div className="stats">
          {STATS.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SocialProof;
