import "./ProductCard.css";

function ProductCard({ product, onBuy }) {
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
      </div>
    </div>
  );
}

export default ProductCard;
