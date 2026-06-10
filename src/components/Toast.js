import "./Toast.css";

const DEFAULT_MESSAGE = "Fetchit is on it! We'll be in touch soon.";

function Toast({ visible, message = DEFAULT_MESSAGE }) {
  return (
    <div
      className={`toast${visible ? " toast--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast-emoji" role="img" aria-label="dog">
        🐕
      </span>
      <span>{message}</span>
    </div>
  );
}

export default Toast;
