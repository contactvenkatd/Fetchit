import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import AuthLayout from "./AuthLayout";
import { useAuth } from "../AuthContext";
import {
  createSetupIntent,
  saveCard,
  saveProfile,
  getFamilyInviteToken,
} from "../utils";
import { stripePromise } from "../stripeClient";
import "./CheckoutPage.css"; // .back-link / .stripe-input / .checkout-row / .stripe-* styles
import "./DeliveryPaymentPage.css";

// Shared look for the Stripe Element iframes — match the cream app inputs.
const ELEMENT_STYLE = {
  base: {
    color: "#1A1A1A",
    fontFamily: '"Nunito", sans-serif',
    fontSize: "16px",
    fontWeight: "600",
    "::placeholder": { color: "#9a9a9a" },
  },
  invalid: { color: "#d32f2f", iconColor: "#d32f2f" },
};

// The address + card form. Inside <Elements> so the Stripe hooks work.
function DeliveryForm() {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [form, setForm] = useState({
    fullName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
  });
  const [cardComplete, setCardComplete] = useState({
    number: false,
    expiry: false,
    cvc: false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Family-invite signups have no subscription, so they skip the card entirely —
  // address only (still needed for orders).
  const invited = !!getFamilyInviteToken();

  const set = (key) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const required = ["fullName", "addressLine1", "city", "state", "zip"];
    if (required.some((k) => !form[k].trim())) {
      setError("Please fill in your name and shipping address.");
      return;
    }

    // Invited (family) signup → save the address only, no card.
    if (invited) {
      setSaving(true);
      await saveProfile({
        fullName: form.fullName.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        country: form.country.trim() || "United States",
      });
      navigate("/onboarding");
      return;
    }

    if (!stripe || !elements) return; // Stripe.js still loading
    if (!cardComplete.number || !cardComplete.expiry || !cardComplete.cvc) {
      setError("Please enter your full card details.");
      return;
    }

    setSaving(true);

    // 1. Server creates/reuses the customer + a SetupIntent (no charge).
    const { data: setup, error: setupErr } = await createSetupIntent();
    if (setupErr) {
      setError(setupErr.message);
      setSaving(false);
      return;
    }

    // 2. Confirm the card in the browser (secret key never involved). The card
    //    is tokenized by Stripe — raw card data never touches our state/network.
    const { error: cardErr, setupIntent } = await stripe.confirmCardSetup(
      setup.clientSecret,
      {
        payment_method: {
          card: elements.getElement(CardNumberElement),
          billing_details: {
            name: form.fullName.trim(),
            address: {
              line1: form.addressLine1.trim(),
              line2: form.addressLine2.trim() || undefined,
              city: form.city.trim(),
              state: form.state.trim(),
              postal_code: form.zip.trim(),
            },
          },
        },
      }
    );
    if (cardErr) {
      setError(cardErr.message || "Your card could not be saved.");
      setSaving(false);
      return;
    }

    const paymentMethodId = setupIntent.payment_method;

    // 3. Set it as the default + read back the display metadata (last4/exp).
    const { data: saved, error: saveErr } = await saveCard(paymentMethodId);
    if (saveErr) {
      setError(saveErr.message);
      setSaving(false);
      return;
    }
    const card = saved.card || {};

    // 4. Persist the shipping address + Stripe pointers + card display fields.
    await saveProfile({
      fullName: form.fullName.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      country: form.country.trim() || "United States",
      stripeCustomerId: setup.customerId,
      stripePaymentMethodId: paymentMethodId,
      cardBrand: card.brand || null,
      cardLast4: card.last4 || null,
      cardExpMonth: card.expMonth || null,
      cardExpYear: card.expYear || null,
    });

    // 5. On to the final "One last thing!" name step.
    navigate("/onboarding");
  };

  return (
    <div className="auth-card dp-card">
      <h1>Almost there! 🐕</h1>
      <p className="auth-sub">
        {invited
          ? "Where should FetchIt ship your orders?"
          : "Where should FetchIt ship your orders, and what card should it use to buy them?"}
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="dp-name">Full name</label>
          <input
            id="dp-name"
            type="text"
            placeholder="Alex Johnson"
            value={form.fullName}
            onChange={set("fullName")}
            autoComplete="name"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="dp-addr1">Address line 1</label>
          <input
            id="dp-addr1"
            type="text"
            placeholder="123 Main St"
            value={form.addressLine1}
            onChange={set("addressLine1")}
            autoComplete="address-line1"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="dp-addr2">Address line 2 (optional)</label>
          <input
            id="dp-addr2"
            type="text"
            placeholder="Apt 4B"
            value={form.addressLine2}
            onChange={set("addressLine2")}
            autoComplete="address-line2"
          />
        </div>

        <div className="dp-row dp-row-city">
          <div className="auth-field">
            <label htmlFor="dp-city">City</label>
            <input
              id="dp-city"
              type="text"
              placeholder="Austin"
              value={form.city}
              onChange={set("city")}
              autoComplete="address-level2"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="dp-state">State</label>
            <input
              id="dp-state"
              type="text"
              placeholder="TX"
              value={form.state}
              onChange={set("state")}
              autoComplete="address-level1"
            />
          </div>
        </div>

        <div className="dp-row">
          <div className="auth-field">
            <label htmlFor="dp-zip">ZIP code</label>
            <input
              id="dp-zip"
              type="text"
              placeholder="78701"
              value={form.zip}
              onChange={set("zip")}
              autoComplete="postal-code"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="dp-country">Country</label>
            <input
              id="dp-country"
              type="text"
              value={form.country}
              onChange={set("country")}
              autoComplete="country-name"
            />
          </div>
        </div>

        {!invited && (
          <>
            <div className="auth-field">
              <label htmlFor="dp-card">Card number</label>
              <div className="stripe-input" id="dp-card">
                <CardNumberElement
                  options={{ style: ELEMENT_STYLE, showIcon: true }}
                  onChange={(e) =>
                    setCardComplete((c) => ({ ...c, number: e.complete }))
                  }
                />
              </div>
            </div>

            <div className="checkout-row">
              <div className="auth-field">
                <label htmlFor="dp-exp">Expiry</label>
                <div className="stripe-input" id="dp-exp">
                  <CardExpiryElement
                    options={{ style: ELEMENT_STYLE }}
                    onChange={(e) =>
                      setCardComplete((c) => ({ ...c, expiry: e.complete }))
                    }
                  />
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="dp-cvc">CVC</label>
                <div className="stripe-input" id="dp-cvc">
                  <CardCvcElement
                    options={{ style: ELEMENT_STYLE }}
                    onChange={(e) =>
                      setCardComplete((c) => ({ ...c, cvc: e.complete }))
                    }
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="field-error checkout-error" role="alert">
            {error}
          </p>
        )}

        {!invited && (
          <>
            <p className="stripe-note">
              <span className="stripe-lock" aria-hidden="true">🔒</span>
              Secured by Stripe — your card is never stored on our servers.
            </p>
            <p className="stripe-test-hint">
              Test mode — use card <code>4242 4242 4242 4242</code>, any future
              expiry &amp; CVC.
            </p>
          </>
        )}

        <button
          type="submit"
          className="btn btn-primary auth-btn"
          disabled={(!invited && !stripe) || saving}
        >
          {saving ? "Saving…" : "Save & Continue"}
        </button>
      </form>

      <button
        type="button"
        className="onboarding-skip"
        onClick={() => navigate("/onboarding")}
        disabled={saving}
      >
        Skip for now
      </button>
    </div>
  );
}

// Protected onboarding step between checkout and the name step.
function DeliveryPaymentPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) return null;

  return (
    <AuthLayout>
      <Elements stripe={stripePromise}>
        <DeliveryForm />
      </Elements>
    </AuthLayout>
  );
}

export default DeliveryPaymentPage;
