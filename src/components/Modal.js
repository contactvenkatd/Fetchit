import { useEffect, useRef, useState } from "react";
import { isValidEmail } from "../utils";
import "./Modal.css";

function Modal({ open, plan, onConfirm, onClose }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    prevFocusRef.current = document.activeElement;
    setEmail("");
    setError("");
    document.body.style.overflow = "hidden";

    const focusId = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 20);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = [
          ...dialogRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ),
        ].filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(focusId);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email");
      if (inputRef.current) inputRef.current.focus();
      return;
    }
    onConfirm(email);
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
        <h2 id="modal-title">Almost there! 🐕</h2>
        <p className="modal-sub">
          You&apos;re signing up for <strong>{plan.name}</strong> —{" "}
          {plan.priceLabel}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="modal-email">Email address</label>
          <input
            id="modal-email"
            ref={inputRef}
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "modal-email-error" : undefined}
          />
          {error && (
            <p className="field-error" id="modal-email-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary modal-confirm">
            Start Fetching
          </button>
          <button type="button" className="modal-cancel" onClick={onClose}>
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default Modal;
