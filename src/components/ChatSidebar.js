import "./ChatSidebar.css";

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3h6a1 1 0 011 1v1h4v2H4V5h4V4a1 1 0 011-1zm-3 6h12l-1 11a2 2 0 01-2 2H9a2 2 0 01-2-2L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"
    />
  </svg>
);

function formatChatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChatSidebar({
  chats,
  currentChatId,
  open,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onIncognito,
}) {
  return (
    <aside
      className={`chat-sidebar${open ? " open" : ""}`}
      aria-label="Chat history"
    >
      <div className="sidebar-head">
        <a href="/" className="logo">
          <span className="logo-mark" role="img" aria-label="Fetchit dog">
            🐕
          </span>
          <span className="logo-text">Fetchit</span>
        </a>
        <button className="new-chat-btn" onClick={onNewChat}>
          + New Chat
        </button>
      </div>

      <div className="sidebar-list">
        {chats.length === 0 ? (
          <p className="sidebar-empty">No chats yet. Start a conversation!</p>
        ) : (
          chats.map((c) => (
            <div
              key={c.id}
              className={`chat-item-wrap${
                c.id === currentChatId ? " active" : ""
              }`}
            >
              <button
                className="chat-item"
                onClick={() => onSelectChat(c)}
                title={c.title}
              >
                <span className="chat-item-title">{c.title}</span>
                <span className="chat-item-date">
                  {formatChatDate(c.createdAt)}
                </span>
              </button>
              <button
                className="chat-delete"
                aria-label={`Delete chat: ${c.title}`}
                onClick={() => onDeleteChat(c.id)}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button className="incognito-btn" onClick={onIncognito}>
          🕵️ Incognito
        </button>
      </div>
    </aside>
  );
}

export default ChatSidebar;
