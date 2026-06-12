import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import Toast from "./Toast";
import ReauthGate from "./ReauthGate";
import { useAuth } from "../AuthContext";
import {
  getProfile,
  saveProfile,
  createSetupIntent,
  saveCard,
  consumeReauthResult,
} from "../utils";
import { stripePromise } from "../stripeClient";
import "./AccountPage.css"; // dark shell, top bar, .account-field/.account-card
import "./CardsAddressPage.css";

// Stripe Element styling for the DARK account inputs (light text on charcoal).
const ELEMENT_STYLE_DARK = {
  base: {
    color: "#ffffff",
    fontFamily: '"Nunito", sans-serif',
    fontSize: "16px",
    fontWeight: "600",
    "::placeholder": { color: "rgba(255,255,255,0.35)" },
  },
  invalid: { color: "#ff7a7a", iconColor: "#ff7a7a" },
};

const EMPTY_ADDRESS = {
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
};

const brandLabel = (b) => (b ? b.charAt(0).toUpperCase() + b.slice(1) : "Card");
const formatExpiry = (m, y) =>
  m && y ? `${String(m).padStart(2, "0")}/${String(y).slice(-2)}` : "";

function CardsAddressInner() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const email = session && session.user && session.user.email;
  const stripe = useStripe();
  const elements = useElements();

  // Reauthentication wall (handled by <ReauthGate> — password or Google).
  const [unlocked, setUnlocked] = useState(false);

  // Profile / address.
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);

  // Saved card + the "update card" sub-form.
  const [card, setCard] = useState(null); // { brand, last4, expMonth, expYear }
  const [editingCard, setEditingCard] = useState(false);
  const [cardComplete, setCardComplete] = useState({
    number: false,
    expiry: false,
    cvc: false,
  });
  const [cardError, setCardError] = useState("");
  const [savingCard, setSavingCard] = useState(false);

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Protected route: must be logged in (once the session check resolves).
  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  // Returning from a Google reauthentication redirect → unlock.
  useEffect(() => {
    if (consumeReauthResult("cards-address")) setUnlocked(true);
  }, []);

  // Load the profile only AFTER the reauthentication wall is cleared.
  useEffect(() => {
    if (!unlocked || !email) return undefined;
    let active = true;
    setLoadingProfile(true);
    getProfile().then((p) => {
      if (!active) return;
      if (p) {
        setAddress({
          fullName: p.fullName,
          addressLine1: p.addressLine1,
          addressLine2: p.addressLine2,
          city: p.city,
          state: p.state,
          zip: p.zip,
          country: p.country || "United States",
        });
        setCard(p.cardLast4 ? {
          brand: p.cardBrand,
          last4: p.cardLast4,
          expMonth: p.cardExpMonth,
          expYear: p.cardExpYear,
        } : null);
      }
      setLoadingProfile(false);
    });
    return () => {
      active = false;
    };
  }, [unlocked, email]);

  if (loading || !session) return null;

  const setField = (key) => (e) => {
    const { value } = e.target;
    setAddress((a) => ({ ...a, [key]: value }));
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    setSavingAddress(true);
    const { error } = await saveProfile({
      fullName: address.fullName.trim(),
      addressLine1: address.addressLine1.trim(),
      addressLine2: address.addressLine2.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      zip: address.zip.trim(),
      country: address.country.trim() || "United States",
    });
    setSavingAddress(false);
    showToast(error ? "Couldn't save — try again." : "Address updated! 🐕");
  };

  const handleSaveCard = async () => {
    setCardError("");
    if (!stripe || !elements) return;
    if (!cardComplete.number || !cardComplete.expiry || !cardComplete.cvc) {
      setCardError("Please enter your full card details.");
      return;
    }
    setSavingCard(true);

    const { data: setup, error: setupErr } = await createSetupIntent();
    if (setupErr) {
      setCardError(setupErr.message);
      setSavingCard(false);
      return;
    }
    const { error: cardErr, setupIntent } = await stripe.confirmCardSetup(
      setup.clientSecret,
      {
        payment_method: {
          card: elements.getElement(CardNumberElement),
          billing_details: {
            name: address.fullName.trim() || undefined,
            address: {
              line1: address.addressLine1.trim() || undefined,
              line2: address.addressLine2.trim() || undefined,
              city: address.city.trim() || undefined,
              state: address.state.trim() || undefined,
              postal_code: address.zip.trim() || undefined,
            },
          },
        },
      }
    );
    if (cardErr) {
      setCardError(cardErr.message || "Your card could not be saved.");
      setSavingCard(false);
      return;
    }
    const paymentMethodId = setupIntent.payment_method;
    const { data: saved, error: saveErr } = await saveCard(paymentMethodId);
    if (saveErr) {
      setCardError(saveErr.message);
      setSavingCard(false);
      return;
    }
    const c = saved.card || {};
    await saveProfile({
      stripeCustomerId: setup.customerId,
      stripePaymentMethodId: paymentMethodId,
      cardBrand: c.brand || null,
      cardLast4: c.last4 || null,
      cardExpMonth: c.expMonth || null,
      cardExpYear: c.expYear || null,
    });
    setCard(c.last4 ? c : null);
    setEditingCard(false);
    setCardComplete({ number: false, expiry: false, cvc: false });
    setSavingCard(false);
    showToast("Card updated! 🐕");
  };

  return (
    <div className="account-page">
      <header className="account-topbar">
        <button
          className="account-back"
          onClick={() => navigate("/chat")}
          aria-label="Back to chat"
        >
          ←
        </button>
        <a href="/" className="logo">
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </a>
        <span className="account-topbar-title">Cards &amp; Address</span>
      </header>

      <main className="account-main">
        {!unlocked ? (
          /* ---------- Reauthentication wall (password or Google) ---------- */
          <div className="account-card ca-lock-card">
            <div className="ca-lock-icon" aria-hidden="true">🔒</div>
            <ReauthGate
              purpose="cards-address"
              returnTo="/cards-address"
              theme="dark"
              title="Confirm it's you"
              description="For your security, verify your identity to view your saved address and payment details."
              submitLabel="Unlock"
              onVerified={() => setUnlocked(true)}
            />
          </div>
        ) : (
          /* ---------- Unlocked: address + card ---------- */
          <div className="account-card">
            <section className="account-section">
              <h2>Shipping address</h2>
              <p className="account-section-sub">
                Where FetchIt ships the things it buys for you.
              </p>

              {loadingProfile ? (
                <p className="ca-loading">Loading…</p>
              ) : (
                <form onSubmit={handleSaveAddress} noValidate>
                  <div className="account-field">
                    <label htmlFor="ca-name">Full name</label>
                    <input id="ca-name" type="text" value={address.fullName}
                      onChange={setField("fullName")} autoComplete="name" />
                  </div>
                  <div className="account-field">
                    <label htmlFor="ca-addr1">Address line 1</label>
                    <input id="ca-addr1" type="text" value={address.addressLine1}
                      onChange={setField("addressLine1")} autoComplete="address-line1" />
                  </div>
                  <div className="account-field">
                    <label htmlFor="ca-addr2">Address line 2 (optional)</label>
                    <input id="ca-addr2" type="text" value={address.addressLine2}
                      onChange={setField("addressLine2")} autoComplete="address-line2" />
                  </div>
                  <div className="account-row">
                    <div className="account-field">
                      <label htmlFor="ca-city">City</label>
                      <input id="ca-city" type="text" value={address.city}
                        onChange={setField("city")} autoComplete="address-level2" />
                    </div>
                    <div className="account-field">
                      <label htmlFor="ca-state">State</label>
                      <input id="ca-state" type="text" value={address.state}
                        onChange={setField("state")} autoComplete="address-level1" />
                    </div>
                  </div>
                  <div className="account-row">
                    <div className="account-field">
                      <label htmlFor="ca-zip">ZIP code</label>
                      <input id="ca-zip" type="text" value={address.zip}
                        onChange={setField("zip")} autoComplete="postal-code" />
                    </div>
                    <div className="account-field">
                      <label htmlFor="ca-country">Country</label>
                      <input id="ca-country" type="text" value={address.country}
                        onChange={setField("country")} autoComplete="country-name" />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary account-btn-save"
                    disabled={savingAddress}>
                    {savingAddress ? "Saving…" : "Save changes"}
                  </button>
                </form>
              )}
            </section>

            <hr className="account-divider" />

            <section className="account-section">
              <h2>Payment method</h2>
              <p className="account-section-sub">
                The card FetchIt charges when it checks out for you.
              </p>

              {card ? (
                <div className="ca-card-row">
                  <span className="ca-card-icon" aria-hidden="true">💳</span>
                  <div className="ca-card-info">
                    <span className="ca-card-brand">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </span>
                    <span className="ca-card-exp">
                      Expires {formatExpiry(card.expMonth, card.expYear)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="ca-no-card">No card on file yet.</p>
              )}

              {!editingCard ? (
                <button
                  type="button"
                  className="btn btn-ghost ca-update-btn"
                  onClick={() => {
                    setCardError("");
                    setEditingCard(true);
                  }}
                >
                  {card ? "Update card" : "Add card"}
                </button>
              ) : (
                <div className="ca-card-form">
                  <div className="account-field">
                    <label htmlFor="ca-card-num">Card number</label>
                    <div className="ca-stripe-input" id="ca-card-num">
                      <CardNumberElement
                        options={{ style: ELEMENT_STYLE_DARK, showIcon: true }}
                        onChange={(e) =>
                          setCardComplete((c) => ({ ...c, number: e.complete }))
                        }
                      />
                    </div>
                  </div>
                  <div className="account-row">
                    <div className="account-field">
                      <label htmlFor="ca-card-exp">Expiry</label>
                      <div className="ca-stripe-input" id="ca-card-exp">
                        <CardExpiryElement
                          options={{ style: ELEMENT_STYLE_DARK }}
                          onChange={(e) =>
                            setCardComplete((c) => ({ ...c, expiry: e.complete }))
                          }
                        />
                      </div>
                    </div>
                    <div className="account-field">
                      <label htmlFor="ca-card-cvc">CVC</label>
                      <div className="ca-stripe-input" id="ca-card-cvc">
                        <CardCvcElement
                          options={{ style: ELEMENT_STYLE_DARK }}
                          onChange={(e) =>
                            setCardComplete((c) => ({ ...c, cvc: e.complete }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {cardError && (
                    <p className="field-error" role="alert">{cardError}</p>
                  )}
                  <p className="ca-stripe-note">
                    🔒 Secured by Stripe — your card is never stored on our
                    servers. Test card <code>4242 4242 4242 4242</code>.
                  </p>

                  <div className="ca-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveCard}
                      disabled={!stripe || savingCard}
                    >
                      {savingCard ? "Saving…" : "Save card"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setEditingCard(false);
                        setCardError("");
                      }}
                      disabled={savingCard}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Toast visible={!!toast} message={toast} />
    </div>
  );
}

// Wrap in <Elements> so the card-update sub-form can use the Stripe hooks.
function CardsAddressPage() {
  return (
    <Elements stripe={stripePromise}>
      <CardsAddressInner />
    </Elements>
  );
}

export default CardsAddressPage;
