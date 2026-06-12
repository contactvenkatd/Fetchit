import { useNavigate } from "react-router-dom";
import "./AccountPage.css"; // reuse the dark shell + top bar styles
import "./TosPage.css";

// Public Terms of Service page — no login required. Dark theme, yellow accents.
function TosPage() {
  const navigate = useNavigate();
  // Return where the user came from (e.g. the chat dropdown); fall back to home
  // for a fresh tab / direct visit so anonymous visitors aren't bounced to login.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="account-page">
      <header className="account-topbar">
        <button className="account-back" onClick={goBack} aria-label="Go back">
          ←
        </button>
        <a href="/" className="logo">
          <img src="/fetchit-logo.png" alt="FetchIt" className="logo-img" />
        </a>
        <span className="account-topbar-title">Terms of Service</span>
      </header>

      <main className="account-main">
        <article className="tos-content">
          <h1>FetchIt Terms of Service</h1>
          <p className="tos-dates">
            <strong>Effective Date:</strong> June 12, 2026
            <br />
            <strong>Last Updated:</strong> June 12, 2026
          </p>

          <p>
            Please read these Terms of Service (&quot;Terms&quot;,
            &quot;Agreement&quot;) carefully before using the FetchIt platform,
            website, mobile application, or any related services (collectively, the
            &quot;Service&quot;) operated by FetchIt (&quot;Company&quot;,
            &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or
            using the Service, creating an account, or completing a purchase through
            the Service, you (&quot;User&quot;, &quot;you&quot;, or &quot;your&quot;)
            agree to be bound by these Terms in their entirety. If you do not agree
            to these Terms, you must not access or use the Service.
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account, clicking &quot;I Agree,&quot; completing the
            onboarding process, or otherwise accessing or using any portion of the
            FetchIt Service, you acknowledge that you have read, understood, and
            agree to be legally bound by these Terms of Service and our Privacy
            Policy, which is incorporated herein by reference. These Terms constitute
            a legally binding agreement between you and FetchIt. FetchIt reserves the
            right to update, modify, or replace these Terms at any time at its sole
            discretion.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            FetchIt is an artificial intelligence-powered shopping assistant platform
            that enables users to search for products, receive personalized
            recommendations, and facilitate automated purchase orders from
            third-party retailers including but not limited to Amazon.com. FetchIt
            acts solely as an intermediary and facilitator between users and
            third-party retailers. FetchIt is not a retailer, seller, or merchant,
            and does not hold, stock, ship, or take title to any products ordered
            through the Service.
          </p>

          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use the Service. The Service is
            currently available to users in the United States only.
          </p>

          <h2>4. Account Registration and Security</h2>
          <p>
            You are solely responsible for maintaining the confidentiality of your
            account credentials. You may not share your account credentials with any
            third party except as expressly permitted under a Max plan family
            membership. FetchIt reserves the right to suspend or terminate your
            account at any time for any violation of these Terms.
          </p>

          <h2>5. Subscription Plans and Billing</h2>
          <p>
            FetchIt offers Free ($0), Plus ($4.99/mo), Pro ($19.99/mo), and Max
            ($99.99/mo) plans. All subscription fees are non-refundable except as
            required by applicable law. Subscriptions renew automatically unless
            cancelled.
          </p>

          <h2>6. Usage Limits and Token Allocation</h2>
          <ul>
            <li>
              Free Plan: 50,000 tokens per 5-hour window; 100,000 tokens per week
            </li>
            <li>
              Plus Plan: 130,000 tokens per 5-hour window; 355,000 tokens per week
            </li>
            <li>
              Pro Plan: 325,000 tokens per 5-hour window; 1,811,000 tokens per week
            </li>
            <li>
              Max Plan: 1,625,000 tokens per 5-hour window; 9,579,000 tokens per week
            </li>
          </ul>

          <h2>7. Service Fees and Transaction Charges</h2>
          <p>
            In addition to your subscription fee, FetchIt charges a service fee on
            each successful order: orders below $20.00 incur a flat $2.00 fee; orders
            of $20.00 or more incur $1.00 plus 5% of the order value. Service fees are
            non-refundable regardless of order outcome.
          </p>

          <h2>8. Ordering Process and Third-Party Fulfillment</h2>
          <p>
            FetchIt uses third-party ordering APIs including Zinc Technologies to
            place orders on your behalf. FetchIt is not the retailer and is not party
            to the contract of sale between you and the retailer. Order cancellations
            and returns are governed by retailer policies. FetchIt&apos;s service fee
            is not refundable in connection with cancellations or returns.
          </p>

          <h2>9. Artificial Intelligence and Data Usage</h2>
          <p>
            The Service uses Grok 4.3 by xAI. Your interactions with the FetchIt AI
            assistant, including search queries, product preferences, purchase
            history, and conversation history, may be used by xAI and its affiliates
            to train, improve, and refine their artificial intelligence models. This
            data sharing is a condition of FetchIt&apos;s use of xAI&apos;s API and
            may not be opted out of while using the Service. If you do not consent to
            your data being used for AI model training, you must not use the Service.
          </p>

          <h2>10. User Responsibilities and Prohibited Conduct</h2>
          <p>
            You agree to use the Service only for lawful purposes. You may not
            circumvent usage limits, use automated bots, reverse engineer the
            Service, create multiple accounts to bypass restrictions, or use the
            Service fraudulently.
          </p>

          <h2>11. Shipping Address and Payment Information</h2>
          <p>
            You are responsible for ensuring your saved shipping address and payment
            method are accurate and current. FetchIt is not liable for failed
            deliveries or orders resulting from inaccurate information.
          </p>

          <h2>12. Max Plan Family Memberships</h2>
          <p>
            The Max Plan permits up to four additional family members under one
            subscription. The account owner is solely responsible for all orders and
            fees incurred by family members.
          </p>

          <h2>13. Privacy and Data Security</h2>
          <p>
            Shipping addresses are stored securely in FetchIt&apos;s database. Payment
            card details are never stored by FetchIt and are handled exclusively by
            Stripe. Shopping data may be shared with xAI as described in Section 9.
          </p>

          <h2>14. Intellectual Property</h2>
          <p>
            All content and features of the Service are the exclusive property of
            FetchIt or its licensors. You are granted a limited, non-exclusive,
            revocable license to use the Service for personal non-commercial use
            only.
          </p>

          <h2>15. Third-Party Services</h2>
          <p>
            The Service depends on Supabase, Stripe, Zinc Technologies, xAI, and
            third-party retailers. FetchIt is not responsible for the availability or
            practices of any third-party services.
          </p>

          <h2>16. Disclaimers and Limitation of Liability</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND.
            FETCHIT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES. FETCHIT&apos;S TOTAL LIABILITY SHALL
            NOT EXCEED THE GREATER OF AMOUNTS PAID IN THE PRECEDING 12 MONTHS OR
            $100.00 USD. You agree to indemnify and hold harmless FetchIt from any
            claims arising from your use of the Service.
          </p>

          <h2>17. Dispute Resolution and Arbitration</h2>
          <p>
            All disputes shall be resolved by binding arbitration under AAA rules in
            Tennessee. You waive your right to participate in any class action lawsuit
            or class-wide arbitration.
          </p>

          <h2>18. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Tennessee.
          </p>

          <h2>19. Termination</h2>
          <p>
            FetchIt may terminate your access at any time for violations of these
            Terms. You may terminate your account through account settings.
            Subscription fees are non-refundable upon termination.
          </p>

          <h2>20. Miscellaneous</h2>
          <p>
            These Terms constitute the entire agreement between you and FetchIt.
            Contact: support@fetchit.com.
          </p>

          <p className="tos-closing">
            By using FetchIt, you acknowledge that you have read these Terms of
            Service, understand them, and agree to be bound by them.
          </p>
        </article>
      </main>
    </div>
  );
}

export default TosPage;
