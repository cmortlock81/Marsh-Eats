const restaurants = [
  { name: "Whitstable Harbour Kitchen", cuisine: "Seafood", eta: "25-35 min", rnli: "1% supports RNLI" },
  { name: "Canterbury Garden Curry", cuisine: "Indian", eta: "30-45 min", rnli: "1% supports RNLI" }
];

export default function HomePage() {
  return <main className="shell"><section className="hero"><p className="eyebrow">Kent local-first marketplace</p><h1>Order local food. Keep more money with restaurants.</h1><p>Marsh Eats charges restaurants 8% commission and tracks a 1% RNLI contribution on every paid order.</p><button>Find food near me</button></section><section className="cards">{restaurants.map((restaurant) => <article className="card" key={restaurant.name}><div className="image" /><h2>{restaurant.name}</h2><p>{restaurant.cuisine} · {restaurant.eta}</p><small>{restaurant.rnli}</small></article>)}</section></main>;
}
