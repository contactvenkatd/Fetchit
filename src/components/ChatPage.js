import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "./ProductCard";
import ChatSidebar from "./ChatSidebar";
import { useAuth } from "../AuthContext";
import {
  signOut,
  getName,
  getChats,
  saveChat,
  deleteChat,
  saveOrder,
} from "../utils";
import "./ChatMockup.css"; // reuse bubble / typing / progress / product-scroll styles
import "./ChatPage.css";

const prefersReduced = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SUGGESTIONS = [
  "🎁 Birthday gift for my mom under $50",
  "☕ Best coffee subscription box",
  "🧧 Wireless headphones under $100",
];

const PRODUCT_SETS = {
  gift: [
    { id: "tea", name: "Premium Tea Sampler Gift Set", price: "$34.99", rating: "4.8", desc: "A curated box of 12 artisan loose-leaf teas.", bg: "linear-gradient(135deg, #d9c7a3, #b3c79c)", emoji: "🍵" },
    { id: "bag", name: "Leather Garden Tool Bag", price: "$47.99", rating: "4.6", desc: "Durable waxed-leather tote for her favorite tools.", bg: "linear-gradient(135deg, #cBaA85, #9c7b52)", emoji: "🧰" },
    { id: "herb", name: "Botanical Herb Starter Kit", price: "$52.00", rating: "4.7", desc: "Everything to grow fresh herbs on the windowsill.", bg: "linear-gradient(135deg, #b6cf9e, #87b56f)", emoji: "🌱" },
  ],
  coffee: [
    { id: "club", name: "Single-Origin Coffee Club (3 mo)", price: "$39.99", rating: "4.9", desc: "Freshly roasted beans delivered every month.", bg: "linear-gradient(135deg, #a9774f, #6f4426)", emoji: "☕" },
    { id: "coldbrew", name: "Cold Brew Starter Kit", price: "$29.99", rating: "4.5", desc: "Everything for smooth cold brew at home.", bg: "linear-gradient(135deg, #c9a37a, #8a5a34)", emoji: "🧊" },
    { id: "sampler", name: "World Sampler Coffee Box", price: "$44.00", rating: "4.7", desc: "Twelve single-origin beans from around the globe.", bg: "linear-gradient(135deg, #b98a5e, #7a4e2c)", emoji: "🌍" },
  ],
  headphones: [
    { id: "aero", name: "AeroBuds Wireless Earbuds", price: "$79.99", rating: "4.6", desc: "30-hour battery with active noise isolation.", bg: "linear-gradient(135deg, #5b6b86, #2f3a4f)", emoji: "🎧" },
    { id: "wave", name: "SoundWave Over-Ear Wireless", price: "$99.00", rating: "4.8", desc: "Plush comfort and deep, balanced bass.", bg: "linear-gradient(135deg, #6d6f76, #34363c)", emoji: "🎧" },
    { id: "fit", name: "FitSport Wireless Buds", price: "$59.99", rating: "4.4", desc: "Sweatproof and secure for every workout.", bg: "linear-gradient(135deg, #4f7d6a, #2c4a3d)", emoji: "🏃" },
  ],
};

function pickProducts(query) {
  const q = query.toLowerCase();
  if (/coffee|espresso|brew|latte/.test(q)) return PRODUCT_SETS.coffee;
  if (/headphone|earbud|earphone|audio|wireless|airpod/.test(q)) return PRODUCT_SETS.headphones;
  return PRODUCT_SETS.gift;
}

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function Message({ m, onBuy }) {
  if (m.type === "products") {
    return (
      <div className="msg msg-fetchit msg-products">
        <div className="avatar" aria-hidden="true">🐕</div>
        <div className="bubble bubble-products">
          <p className="products-intro">Here are 3 great matches:</p>
          <div className="product-scroll">
            {m.products.map((p) => (
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
        <div className="avatar" aria-hidden="true">🐕</div>
        <div className="bubble typing" aria-label="Fetchit is typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    );
  }
  if (m.type === "progress") {
    return (
      <div className="msg msg-fetchit">
        <div className="avatar" aria-hidden="true">🐕</div>
        <div className="bubble">
          <div className="progress"><div className="progress-fill"></div></div>
        </div>
      </div>
    );
  }
  const isUser = m.sender === "user";
  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-fetchit"}`}>
      {!isUser && <div className="avatar" aria-hidden="true">🐕</div>}
      <div className="bubble">{m.text}</div>
    </div>
  );
}

function ChatPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const email = session && session.user && session.user.email;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("empty"); // empty | leaving | chatting
  const [menuOpen, setMenuOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [incognito, setIncognito] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const idRef = useRef(0);
  const timersRef = useRef([]);
  const buyingRef = useRef(false);
  const chatRef = useRef(null);
  const menuRef = useRef(null);
  const currentChatRef = useRef(null); // { id, title, createdAt }

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Load this user's chat history.
  useEffect(() => {
    if (!email) return undefined;
    let active = true;
    getChats().then((list) => {
      if (active) setChats(list);
    });
    return () => {
      active = false;
    };
  }, [email]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Close the account dropdown on outside click.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Auto-scroll to newest message.
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced() ? "auto" : "smooth" });
  }, [messages]);

  // Persist the current chat whenever it changes (skipped in incognito).
  useEffect(() => {
    if (incognito || !email) return undefined;
    const meta = currentChatRef.current;
    if (!meta) return undefined;
    const persistable = messages.filter(
      (m) => m.type === "text" || m.type === "products"
    );
    if (persistable.length === 0) return undefined;
    let active = true;
    (async () => {
      await saveChat({ ...meta, messages: persistable });
      if (!active) return;
      const list = await getChats();
      if (active) setChats(list);
    })();
    return () => {
      active = false;
    };
  }, [messages, incognito, email]);

  if (loading || !session) return null;

  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };
  const schedule = (fn, delay) => {
    const id = setTimeout(fn, delay);
    timersRef.current.push(id);
  };
  const add = (msg) => setMessages((prev) => [...prev, { id: nextId(), ...msg }]);
  const removeType = (type) =>
    setMessages((prev) => prev.filter((m) => m.type !== type));

  const runConversation = (text) => {
    const reduced = prefersReduced();
    add({ sender: "user", type: "text", text });
    add({ sender: "fetchit", type: "typing" });
    schedule(() => {
      removeType("typing");
      add({ sender: "fetchit", type: "text", text: "Got it! Let me find the best options for you... 🔍" });
    }, reduced ? 0 : 1500);
    schedule(() => {
      add({ sender: "fetchit", type: "products", products: pickProducts(text) });
    }, reduced ? 0 : 4000);
  };

  const handleSubmit = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    setSidebarOpen(false);

    // Start a new persisted chat on the first message (normal mode only).
    if (!incognito && !currentChatRef.current) {
      const id = makeId();
      currentChatRef.current = {
        id,
        title: truncate(trimmed, 40),
        createdAt: new Date().toISOString(),
      };
      setCurrentChatId(id);
    }

    if (phase === "chatting") {
      runConversation(trimmed);
      return;
    }
    const reduced = prefersReduced();
    setPhase("leaving");
    schedule(() => {
      setPhase("chatting");
      runConversation(trimmed);
    }, reduced ? 0 : 300);
  };

  const handleBuy = (product) => {
    if (buyingRef.current) return;
    buyingRef.current = true;
    const reduced = prefersReduced();
    add({ sender: "user", type: "text", text: "Buy This 🐕" });
    add({ sender: "fetchit", type: "text", text: "🛒 Checking out in the background..." });
    if (!reduced) add({ sender: "fetchit", type: "progress" });
    saveOrder({ productName: product.name, price: product.price });
    schedule(() => {
      removeType("progress");
      add({ sender: "fetchit", type: "text", text: `✅ Done! Your ${product.name} is ordered. Confirmation sent to your email.` });
      buyingRef.current = false;
    }, reduced ? 0 : 2000);
  };

  const resetToEmpty = () => {
    currentChatRef.current = null;
    setCurrentChatId(null);
    setMessages([]);
    setPhase("empty");
  };

  const handleNewChat = () => {
    resetToEmpty();
    setSidebarOpen(false);
  };

  const handleSelectChat = (chat) => {
    currentChatRef.current = {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
    };
    setCurrentChatId(chat.id);
    setMessages(chat.messages.map((m) => ({ ...m, id: nextId() })));
    setPhase("chatting");
    setSidebarOpen(false);
  };

  const handleDeleteChat = async (id) => {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    await deleteChat(id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (currentChatRef.current && currentChatRef.current.id === id) resetToEmpty();
  };

  const enterIncognito = () => {
    setIncognito(true);
    setSidebarOpen(false);
    resetToEmpty();
  };

  const exitIncognito = () => {
    setIncognito(false);
    resetToEmpty();
    if (email) getChats().then(setChats);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const { firstName } = getName(session);
  const greeting = firstName ? `Hi, ${firstName} 👋` : email;
  const initial = (firstName || email || "?").charAt(0).toUpperCase();

  return (
    <div className={`chat-shell${incognito ? " incognito" : ""}`}>
      {!incognito && (
        <ChatSidebar
          chats={chats}
          currentChatId={currentChatId}
          open={sidebarOpen}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onIncognito={enterIncognito}
        />
      )}
      {!incognito && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="chat-col">
        <header className="chat-nav">
          <div className="chat-nav-left">
            {!incognito && (
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open chat history"
              >
                ☰
              </button>
            )}
            <a href="/" className="logo">
              <span className="logo-mark" role="img" aria-label="Fetchit dog">🐕</span>
              <span className="logo-text">Fetchit</span>
            </a>
            {incognito && <span className="incognito-badge">🕵️ Incognito Mode</span>}
          </div>

          <div className="chat-nav-right">
            {incognito ? (
              <button className="btn btn-ghost exit-incognito" onClick={exitIncognito}>
                Exit Incognito
              </button>
            ) : (
              <div className="chat-account" ref={menuRef}>
                <button
                  className="account-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className="account-avatar" aria-hidden="true">{initial}</span>
                  <span className="account-email">{greeting}</span>
                  <span className="account-caret" aria-hidden="true">⌄</span>
                </button>
                {menuOpen && (
                  <div className="account-menu" role="menu">
                    <button role="menuitem" onClick={() => navigate("/account")}>
                      Account Settings
                    </button>
                    <button role="menuitem" onClick={handleLogout}>Log Out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {incognito && (
          <div className="incognito-banner" role="status">
            🕵️ Incognito mode — this chat won&apos;t be saved
          </div>
        )}

        <main className="chat-main">
          {phase !== "chatting" ? (
            <div className={`chat-empty${phase === "leaving" ? " is-leaving" : ""}`}>
              <div className="chat-empty-dog" aria-hidden="true">🐕</div>
              <h1>What can we get you?</h1>
              <p>Describe anything — I&apos;ll find it, compare it, and buy it for you.</p>
              <div className="chat-chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chat-chip" onClick={() => handleSubmit(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-thread" ref={chatRef}>
              {messages.map((m) => (
                <Message key={m.id} m={m} onBuy={handleBuy} />
              ))}
            </div>
          )}
        </main>

        <form
          className="chat-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(input);
          }}
        >
          <label htmlFor="chat-input" className="visually-hidden">
            Tell Fetchit what you need
          </label>
          <input
            id="chat-input"
            type="text"
            placeholder="Tell Fetchit what you need..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="chat-send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.18L4.1 11 14 12l-9.9 1-2.09 6.22a1 1 0 001.39 1.18z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatPage;
