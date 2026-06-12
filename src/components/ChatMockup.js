import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import "./ChatMockup.css";

const PRODUCTS = [
  {
    id: "tea",
    name: "Premium Tea Sampler Gift Set",
    price: "$34.99",
    rating: "4.8",
    desc: "A curated box of 12 artisan loose-leaf teas.",
    bg: "linear-gradient(135deg, #d9c7a3, #b3c79c)",
    emoji: "🍵",
  },
  {
    id: "bag",
    name: "Leather Garden Tool Bag",
    price: "$47.99",
    rating: "4.6",
    desc: "Durable waxed-leather tote for her favorite tools.",
    bg: "linear-gradient(135deg, #cBaA85, #9c7b52)",
    emoji: "🧰",
  },
  {
    id: "herb",
    name: "Botanical Herb Starter Kit",
    price: "$52.00",
    rating: "4.7",
    desc: "Everything to grow fresh herbs on the windowsill.",
    bg: "linear-gradient(135deg, #b6cf9e, #87b56f)",
    emoji: "🌱",
  },
];

const DEMO_TEXTS = [
  ["fetchit", "Hey! 🐕 What are you shopping for today?"],
  ["user", "I need a birthday gift for my mom, around $50"],
  [
    "fetchit",
    "Love it! How old is she, and does she have any hobbies or interests I should know about?",
  ],
  ["user", "She's 60 and loves gardening and tea"],
  ["fetchit", "Perfect — give me a sec while I find the best picks for her! 🔍"],
];

const STEP = 1200; // ms between auto messages
const TYPING_MS = 2000;

const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Message({ m, onBuy }) {
  if (m.type === "products") {
    return (
      <div className="msg msg-fetchit msg-products">
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
        <div className="bubble bubble-products">
          <p className="products-intro">Here are my top 3 picks for her:</p>
          <div className="product-scroll">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} onBuy={onBuy} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (m.type === "typing") {
    return (
      <div className="msg msg-fetchit">
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
        <div className="bubble typing" aria-label="FetchIt is typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }
  if (m.type === "progress") {
    return (
      <div className="msg msg-fetchit">
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
        <div className="bubble">
          <div className="progress">
            <div className="progress-fill"></div>
          </div>
        </div>
      </div>
    );
  }
  const isUser = m.sender === "user";
  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-fetchit"}`}>
      {!isUser && (
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
      )}
      <div className="bubble">{m.text}</div>
    </div>
  );
}

// The hero mock chat is VIEW-ONLY: the conversation auto-plays on scroll, but
// the user can't type, send, or buy (the whole browser-window has
// pointer-events: none, and the input/buttons are disabled).
function ChatMockup() {
  const [messages, setMessages] = useState([]);

  const idRef = useRef(0);
  const timersRef = useRef([]);
  const sectionRef = useRef(null);
  const chatRef = useRef(null);
  const startRef = useRef(null);

  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };
  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay);
    timersRef.current.push(id);
  };
  const addText = (sender, text) =>
    setMessages((prev) => [...prev, { id: nextId(), sender, type: "text", text }]);
  const addTyping = () =>
    setMessages((prev) => [
      ...prev,
      { id: nextId(), sender: "fetchit", type: "typing" },
    ]);
  const addProducts = () =>
    setMessages((prev) => [
      ...prev,
      { id: nextId(), sender: "fetchit", type: "products" },
    ]);
  const removeType = (type) =>
    setMessages((prev) => prev.filter((m) => m.type !== type));

  // Reassigned every render so the observer always calls the latest closure.
  // Each call RESETS the demo and replays it from the very beginning, so the
  // animation restarts every time the section re-enters the viewport.
  startRef.current = () => {
    // Cancel anything still scheduled from a previous play, then clear the chat.
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setMessages([]);

    if (prefersReduced()) {
      setMessages([
        ...DEMO_TEXTS.map(([sender, text]) => ({
          id: nextId(),
          sender,
          type: "text",
          text,
        })),
        { id: nextId(), sender: "fetchit", type: "products" },
      ]);
      return;
    }

    DEMO_TEXTS.forEach(([sender, text], i) => {
      schedule(() => addText(sender, text), 400 + i * STEP);
    });
    const typingAt = 400 + DEMO_TEXTS.length * STEP;
    schedule(() => addTyping(), typingAt);
    schedule(() => {
      removeType("typing");
      addProducts();
    }, typingAt + TYPING_MS);
  };

  // Replay the demo every time the chat scrolls into view. The observer keeps
  // watching (no disconnect), so scrolling away and back restarts it fresh.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && startRef.current) startRef.current();
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll the chat area to the newest message.
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReduced() ? "auto" : "smooth",
    });
  }, [messages]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // No buy / send handlers — the mock is view-only (see the form below).

  return (
    <section className="block chat-section" id="chat" ref={sectionRef}>
      <div className="container">
        <div className="section-head chat-head">
          <h2>Meet FetchIt AI</h2>
          <p>Watch a real shopping conversation unfold.</p>
        </div>

        {/* View-only: pointer-events disabled, inputs/buttons inert. */}
        <div className="browser-window is-static" aria-hidden="true">
          <div className="browser-bar">
            <span className="dot dot-red"></span>
            <span className="dot dot-yellow"></span>
            <span className="dot dot-green"></span>
            <div className="address-bar">fetchit.app</div>
          </div>

          <div className="chat-area" ref={chatRef}>
            {messages.map((m) => (
              <Message key={m.id} m={m} onBuy={() => {}} />
            ))}
          </div>

          <form className="chat-input" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="chat-text" className="visually-hidden">
              Message FetchIt
            </label>
            <input
              id="chat-text"
              type="text"
              placeholder="Message FetchIt…"
              readOnly
              disabled
              tabIndex={-1}
              autoComplete="off"
            />
            <button type="button" className="chat-send" disabled tabIndex={-1}>
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default ChatMockup;
