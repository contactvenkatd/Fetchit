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
  getPlan,
  tokenLimit,
  weeklyTokenLimit,
  estimateTokens,
  formatResetIn,
  getOrCreateSession,
  isSessionExpired,
  addSessionTokens,
  getOrCreateWeeklyUsage,
  isWeekExpired,
  addWeeklyTokens,
  familyDisbandDue,
  leaveFamily,
  NEXT_PLAN,
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
    { id: "tea", name: "Premium Tea Sampler Gift Set", price: "$34.99", rating: "4.8", desc: "A curated box of 12 artisan loose-leaf teas.", bg: "linear-gradient(135deg, #d9c7a3, #b3c79c)", emoji: "🍵", category: "Food & Drink" },
    { id: "bag", name: "Leather Garden Tool Bag", price: "$47.99", rating: "4.6", desc: "Durable waxed-leather tote for her favorite tools.", bg: "linear-gradient(135deg, #cBaA85, #9c7b52)", emoji: "🧰", category: "Home & Garden" },
    { id: "herb", name: "Botanical Herb Starter Kit", price: "$52.00", rating: "4.7", desc: "Everything to grow fresh herbs on the windowsill.", bg: "linear-gradient(135deg, #b6cf9e, #87b56f)", emoji: "🌱", category: "Home & Garden" },
  ],
  coffee: [
    { id: "club", name: "Single-Origin Coffee Club (3 mo)", price: "$39.99", rating: "4.9", desc: "Freshly roasted beans delivered every month.", bg: "linear-gradient(135deg, #a9774f, #6f4426)", emoji: "☕", category: "Food & Drink" },
    { id: "coldbrew", name: "Cold Brew Starter Kit", price: "$29.99", rating: "4.5", desc: "Everything for smooth cold brew at home.", bg: "linear-gradient(135deg, #c9a37a, #8a5a34)", emoji: "🧊", category: "Kitchen" },
    { id: "sampler", name: "World Sampler Coffee Box", price: "$44.00", rating: "4.7", desc: "Twelve single-origin beans from around the globe.", bg: "linear-gradient(135deg, #b98a5e, #7a4e2c)", emoji: "🌍", category: "Food & Drink" },
  ],
  headphones: [
    { id: "aero", name: "AeroBuds Wireless Earbuds", price: "$79.99", rating: "4.6", desc: "30-hour battery with active noise isolation.", bg: "linear-gradient(135deg, #5b6b86, #2f3a4f)", emoji: "🎧", category: "Electronics" },
    { id: "wave", name: "SoundWave Over-Ear Wireless", price: "$99.00", rating: "4.8", desc: "Plush comfort and deep, balanced bass.", bg: "linear-gradient(135deg, #6d6f76, #34363c)", emoji: "🎧", category: "Electronics" },
    { id: "fit", name: "FitSport Wireless Buds", price: "$59.99", rating: "4.4", desc: "Sweatproof and secure for every workout.", bg: "linear-gradient(135deg, #4f7d6a, #2c4a3d)", emoji: "🏃", category: "Electronics" },
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

function Message({ m, onBuy, onUpgrade }) {
  if (m.type === "limit") {
    const weekly = m.scope === "weekly";
    return (
      <div className="msg msg-fetchit">
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
        <div className="bubble bubble-limit" role="status">
          {weekly ? (
            <>
              <p className="limit-title">You&apos;ve reached your weekly limit 🐕</p>
              <p>Resets Monday at midnight.</p>
            </>
          ) : (
            <>
              <p className="limit-title">You&apos;ve reached your session limit 🐕</p>
              <p>Your session resets in {m.resetText}.</p>
            </>
          )}
          {m.next && (
            <>
              <p>
                Upgrade to {m.next.plan} for {m.next.multiplier} more usage.
              </p>
              <button type="button" className="limit-upgrade" onClick={onUpgrade}>
                Upgrade to {m.next.plan} →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
  if (m.type === "products") {
    return (
      <div className="msg msg-fetchit msg-products">
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
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
        <div className="avatar" aria-hidden="true">
          <img src="/fetchit-logo.png" alt="" className="avatar-img" />
        </div>
        <div className="bubble typing" aria-label="FetchIt is typing">
          <span></span><span></span><span></span>
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
          <div className="progress"><div className="progress-fill"></div></div>
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
  const sessionRef = useRef(null); // active 5-hour window { id, tokensUsed, sessionStart }
  const weeklyRef = useRef(null); // active weekly window { id, tokensUsed, weekStart }

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Lazy family disband: a family member whose owner cancelled Max and whose
  // disband date has passed is finalized on app use — downgraded to Free and
  // their membership removed (getPlan already reports Free; this persists it).
  const lapseRef = useRef(false);
  useEffect(() => {
    if (lapseRef.current || !session) return;
    if (familyDisbandDue(session)) {
      lapseRef.current = true;
      leaveFamily();
    }
  }, [session]);

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

  // Prime the user's usage windows — the 5-hour session AND the weekly window
  // (token limit tracking — invisible to the user). Skipped in incognito so
  // nothing is written to Supabase.
  useEffect(() => {
    if (!email || incognito) return undefined;
    let active = true;
    const plan = getPlan(session);
    getOrCreateSession(plan).then((s) => {
      if (active) sessionRef.current = s;
    });
    getOrCreateWeeklyUsage(plan).then((w) => {
      if (active) weeklyRef.current = w;
    });
    return () => {
      active = false;
    };
  }, [email, incognito, session]);

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

  // Token/usage gate. Estimates the cost of this exchange and blocks if EITHER
  // the 5-hour session window OR the weekly window is exhausted; otherwise records
  // the tokens in both. Returns { allowed } or { allowed: false, reason, sess }.
  // Fails open on a DB error (e.g. a table isn't migrated yet) so chat still
  // works. All of this is invisible to the user.
  const consumeOrBlock = async (text) => {
    // getPlan() returns the real paid plan during a scheduled cancellation
    // (until plan_cancels_at), so a canceled-but-active user keeps their higher
    // token limit until the period actually ends.
    const plan = getPlan(session);
    const sessLimit = tokenLimit(plan);
    const weekLimit = weeklyTokenLimit(plan);

    // Refresh the 5-hour window (roll over if expired).
    let sess = sessionRef.current;
    if (!sess || isSessionExpired(sess)) {
      sess = await getOrCreateSession(plan);
      sessionRef.current = sess;
    }
    // Refresh the weekly window (roll over after Monday).
    let week = weeklyRef.current;
    if (!week || isWeekExpired(week)) {
      week = await getOrCreateWeeklyUsage(plan);
      weeklyRef.current = week;
    }

    // No tracking available at all → don't block.
    if (!sess && !week) return { allowed: true };

    // Weekly cap is checked first — it's the longer, harder limit to recover from.
    if (week && week.tokensUsed >= weekLimit) {
      return { allowed: false, reason: "weekly" };
    }
    if (sess && sess.tokensUsed >= sessLimit) {
      return { allowed: false, reason: "session", sess };
    }

    const products = pickProducts(text);
    const cost =
      estimateTokens(text) +
      estimateTokens("Got it! Let me find the best options for you... 🔍") +
      products.reduce((s, p) => s + estimateTokens(`${p.name} ${p.desc}`), 0);
    if (sess) {
      const total = await addSessionTokens(sess.id, sess.tokensUsed, cost);
      sessionRef.current = { ...sess, tokensUsed: total };
    }
    if (week) {
      const wTotal = await addWeeklyTokens(week.id, week.tokensUsed, cost);
      weeklyRef.current = { ...week, tokensUsed: wTotal };
    }
    return { allowed: true };
  };

  const showLimitMessage = (gate) => {
    const next = NEXT_PLAN[getPlan(session)];
    const pushLimit = () => {
      if (gate.reason === "weekly") {
        add({ sender: "fetchit", type: "limit", scope: "weekly", next });
      } else {
        const resetText = formatResetIn(gate.sess.sessionStart).text;
        add({ sender: "fetchit", type: "limit", scope: "session", resetText, next });
      }
    };
    if (phase !== "chatting") {
      setPhase("chatting");
      schedule(pushLimit, prefersReduced() ? 0 : 50);
    } else {
      pushLimit();
    }
  };

  const handleSubmit = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    setSidebarOpen(false);

    // Usage gate (skipped in incognito — incognito writes nothing to Supabase).
    if (!incognito) {
      const gate = await consumeOrBlock(trimmed);
      if (!gate.allowed) {
        showLimitMessage(gate);
        return;
      }
    }

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

  const handleUpgrade = () => navigate("/plans");

  const handleBuy = (product) => {
    if (buyingRef.current) return;
    buyingRef.current = true;
    const reduced = prefersReduced();
    add({ sender: "user", type: "text", text: "Buy This 🐕" });
    add({ sender: "fetchit", type: "text", text: "🛒 Checking out in the background..." });
    if (!reduced) add({ sender: "fetchit", type: "progress" });
    saveOrder({
      productName: product.name,
      price: product.price,
      productImage: product.emoji,
      retailer: "Amazon",
      category: product.category,
      zincOrderId: `zinc_${makeId().replace(/-/g, "").slice(0, 12)}`,
    });
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
  // Family Sharing is visible to Max owners (manage the family) AND max_family
  // members (see who they share with + Leave Family).
  const userPlan = getPlan(session);
  const showFamilySharing = userPlan === "Max" || userPlan === "max_family";

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
              <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
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
                    <button role="menuitem" onClick={() => navigate("/cards-address")}>
                      Cards &amp; Address
                    </button>
                    {showFamilySharing && (
                      <button role="menuitem" onClick={() => navigate("/family-sharing")}>
                        Family Sharing
                      </button>
                    )}
                    <button role="menuitem" onClick={() => navigate("/orders")}>
                      Orders &amp; Analytics
                    </button>
                    <button role="menuitem" onClick={handleLogout}>Log Out</button>
                    <button role="menuitem" onClick={() => navigate("/tos")}>
                      Terms of Service
                    </button>
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
                <Message
                  key={m.id}
                  m={m}
                  onBuy={handleBuy}
                  onUpgrade={handleUpgrade}
                />
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
            Tell FetchIt what you need
          </label>
          <input
            id="chat-input"
            type="text"
            placeholder="Tell FetchIt what you need..."
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
