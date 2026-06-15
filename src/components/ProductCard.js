import { useState } from "react";
import { FREQUENCY_OPTIONS } from "../utils";
import "./ProductCard.css";

// onBuy is always provided where the card is interactive. onSaveWishlist and
// onAutoReorder are optional — they render the extra actions only when wired
// (the landing ChatMockup leaves them out so its demo cards stay inert).
function ProductCard({ product, onBuy, onSaveWishlist, onAutoReorder }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const chooseFrequency = (key) => {
    setPickerOpen(false);
    onAutoReorder(product, key);
  };

  return (
    <div className="product-card">
      <div className="product-img" style={{ background: product.bg }}>
        <span className="product-emoji" role="img" aria-hidden="true">
          {product.emoji}
        </span>
      </div>
      <div className="product-body">
        <div className="product-rating">{product.rating} ⭐</div>
        <h4 className="product-name">{product.name}</h4>
        <p className="product-desc">{product.desc}</p>
        <div className="product-price">{product.price}</div>
        <button className="product-buy" onClick={() => onBuy(product)}>
          Buy This 🐕
        </button>

        {onSaveWishlist && (
          <button
            className="product-wishlist"
            onClick={() => onSaveWishlist(product)}
          >
            ♡ Save to Wishlist
          </button>
        )}

        {onAutoReorder && (
          <div className="product-reorder-wrap">
            <button
              className="product-reorder"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
            >
              🔁 Auto-Reorder
            </button>
            {pickerOpen && (
              <div className="reorder-picker" role="menu">
                <p className="reorder-picker-title">Reorder every…</p>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    role="menuitem"
                    className="reorder-option"
                    onClick={() => chooseFrequency(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductCard;
