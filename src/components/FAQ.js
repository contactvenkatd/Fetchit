import { useState } from "react";
import "./FAQ.css";

const FAQS = [
  {
    q: "How does FetchIt work?",
    a: "Tell FetchIt what you're looking for and it searches hundreds of stores, compares prices, and — once you approve — checks out for you. It's like having a shopping-savvy best friend on call 24/7.",
  },
  {
    q: "Is my payment info safe?",
    a: "Absolutely. Your payment details are encrypted and stored with bank-level security, and FetchIt never completes a purchase without your explicit approval.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yep! There are no contracts or commitments. Cancel or downgrade your plan anytime from your account settings — no questions asked.",
  },
  {
    q: "Which stores does FetchIt support?",
    a: "FetchIt works with hundreds of major retailers and adds more every week. If your favorite store isn't supported yet, let us know and we'll fetch it.",
  },
  {
    q: "What happens if I want a refund?",
    a: "FetchIt tracks every order's return window and helps you start a refund in a couple of taps, guiding you through each store's process so you never miss a deadline.",
  },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (i) => setOpenIndex((current) => (current === i ? null : i));

  return (
    <section className="block faq-block" id="faq">
      <div className="container faq-container">
        <div className="section-head">
          <h2>Frequently Asked Questions</h2>
          <p>Everything you need to know before you start fetching.</p>
        </div>
        <div className="faq-list">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div className={`faq-item${isOpen ? " open" : ""}`} key={item.q}>
                <button
                  className="faq-question"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span>{item.q}</span>
                  <span className="faq-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </button>
                <div
                  className="faq-answer"
                  id={`faq-answer-${i}`}
                  role="region"
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default FAQ;
