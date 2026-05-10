"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPounds } from "@marsh-eats/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "pk_test_replace_me";

type FulfilmentType = "delivery" | "collection";
interface Restaurant { id: string; name: string; slug: string; cuisine: string; cuisineTypes: string[]; description?: string; town: string; address: string; logoUrl?: string; isAcceptingOrders: boolean; collectionEnabled: boolean; deliveryEnabled: boolean; minimumOrderPence: number; estimatedPrepMinutes: number; }
interface MenuItem { id: string; name: string; description?: string; pricePence: number; allergens: string[]; }
interface MenuCategory { id: string; name: string; items: MenuItem[]; }
interface CartLine { restaurantId: string; restaurantName: string; item: MenuItem; quantity: number; }
interface User { id: string; email: string; fullName: string; role: string; }
interface OrderResponse { id: string; total_pence: number; subtotal_pence: number; rnli_contribution_pence: number; status: string; }
interface StripeCard { mount(selector: string): void; }
interface StripeElements { create(kind: "card", options?: Record<string, unknown>): StripeCard; }
interface StripeClient { elements(): StripeElements; confirmCardPayment(secret: string, options: { payment_method: { card: StripeCard } }): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>; }

declare global { interface Window { Stripe?: (key: string) => StripeClient; } }

function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) setValue(JSON.parse(stored) as T);
  }, [key]);
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue] as const;
}

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

export default function HomePage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [cart, setCart] = useLocalStorageState<CartLine[]>("marsh-eats-cart", []);
  const [token, setToken] = useLocalStorageState<string | null>("marsh-eats-token", null);
  const [user, setUser] = useLocalStorageState<User | null>("marsh-eats-user", null);
  const [view, setView] = useState<"browse" | "menu" | "basket" | "checkout" | "confirmation">("browse");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const cardMounted = useRef(false);
  const stripe = useRef<StripeClient | null>(null);
  const card = useRef<StripeCard | null>(null);

  const totals = useMemo(() => ({ subtotal: cart.reduce((sum, line) => sum + line.item.pricePence * line.quantity, 0), count: cart.reduce((sum, line) => sum + line.quantity, 0) }), [cart]);

  useEffect(() => {
    setLoading(true);
    api<{ restaurants: Restaurant[] }>("/api/v1/restaurants").then((data) => setRestaurants(data.restaurants)).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function openMenu(restaurant: Restaurant) {
    setSelected(restaurant); setView("menu"); setError(null); setLoading(true);
    try {
      const data = await api<{ categories: MenuCategory[] }>(`/api/v1/restaurants/${restaurant.id}/menu`);
      setCategories(data.categories);
    } catch (err) { setError(err instanceof Error ? err.message : "Menu failed to load"); }
    finally { setLoading(false); }
  }

  function addToCart(item: MenuItem) {
    if (!selected) return;
    setCart((current) => {
      const withoutOtherRestaurant = current.filter((line) => line.restaurantId === selected.id);
      const existing = withoutOtherRestaurant.find((line) => line.item.id === item.id);
      if (existing) return withoutOtherRestaurant.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...withoutOtherRestaurant, { restaurantId: selected.id, restaurantName: selected.name, item, quantity: 1 }];
    });
  }

  function updateQuantity(itemId: string, quantity: number) {
    setCart((current) => current.map((line) => line.item.id === itemId ? { ...line, quantity } : line).filter((line) => line.quantity > 0));
  }

  async function loginDemo() {
    const data = await api<{ user: User; accessToken: string }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "customer@marsh-eats.test", password: "MarshEats123!" }) });
    setUser(data.user); setToken(data.accessToken);
  }

  async function createOrderAndIntent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setPaymentMessage(null);
    if (!cart.length) { setError("Your basket is empty."); return; }
    if (!token) { await loginDemo(); }
    const activeToken = localStorage.getItem("marsh-eats-token") ?? token;
    if (!activeToken) { setError("Please sign in before checkout."); return; }
    const form = new FormData(event.currentTarget);
    const created = await api<OrderResponse>("/api/v1/orders", { method: "POST", body: JSON.stringify({
      restaurantId: cart[0].restaurantId,
      fulfilmentType: form.get("fulfilmentType"),
      idempotencyKey: crypto.randomUUID(),
      customerContact: { name: form.get("name"), email: form.get("email"), phone: form.get("phone") },
      deliveryAddress: form.get("fulfilmentType") === "delivery" ? { line1: form.get("line1"), town: form.get("town"), postcode: form.get("postcode") } : undefined,
      notes: form.get("notes"),
      items: cart.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity }))
    }) }, activeToken);
    setOrder(created);
    const intent = await api<{ clientSecret: string }>(`/api/v1/orders/${created.id}/payment-intents`, { method: "POST", body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }, activeToken);
    setClientSecret(intent.clientSecret);
    await loadStripeCard();
  }

  async function loadStripeCard() {
    if (!window.Stripe) {
      await new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = "https://js.stripe.com/v3/"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Stripe.js failed to load")); document.head.append(script); });
    }
    if (!window.Stripe || cardMounted.current) return;
    stripe.current = window.Stripe(stripePublishableKey);
    card.current = stripe.current.elements().create("card", { style: { base: { fontSize: "16px" } } });
    card.current.mount("#card-element");
    cardMounted.current = true;
  }

  async function pay() {
    if (!clientSecret || !stripe.current || !card.current) return;
    setPaymentMessage("Confirming payment...");
    const result = await stripe.current.confirmCardPayment(clientSecret, { payment_method: { card: card.current } });
    if (result.error) { setPaymentMessage(result.error.message ?? "Payment failed. Try card 4000 0000 0000 9995 to test failure."); return; }
    setPaymentMessage("Payment succeeded. Your order is on its way to the restaurant.");
    setCart([]); setView("confirmation");
  }

  return <main className="shell">
    <section className="hero"><p className="eyebrow">Kent local-first marketplace</p><h1>Order local food. Keep more money with restaurants.</h1><p>8% commission and 1% RNLI contribution are calculated server-side.</p><button onClick={() => setView("browse")}>Find food near me</button></section>
    {error && <p className="alert">{error}</p>}
    {loading && <p className="panel">Loading fresh local food…</p>}

    {view === "browse" && !loading && <section className="cards">{restaurants.length ? restaurants.map((restaurant) => <article className="card" key={restaurant.id} onClick={() => void openMenu(restaurant)}><div className="image" style={{ backgroundImage: restaurant.logoUrl ? `url(${restaurant.logoUrl})` : undefined }} /><h2>{restaurant.name}</h2><p>{restaurant.cuisineTypes.join(" · ")} · {restaurant.estimatedPrepMinutes}-{restaurant.estimatedPrepMinutes + 10} min</p><p>{restaurant.description}</p><small>{restaurant.deliveryEnabled ? "Delivery" : "Collection only"} · Min {formatPounds(restaurant.minimumOrderPence)}</small></article>) : <p className="panel">No restaurants are accepting orders right now.</p>}</section>}

    {view === "menu" && selected && <section><button className="ghost" onClick={() => setView("browse")}>← Restaurants</button><h2>{selected.name}</h2><p>{selected.address}</p>{categories.length ? categories.map((category) => <div className="panel" key={category.id}><h3>{category.name}</h3>{category.items.length ? category.items.map((item) => <article className="menu-item" key={item.id}><div><strong>{item.name}</strong><p>{item.description}</p><small>{item.allergens.length ? `Allergens: ${item.allergens.join(", ")}` : "No declared allergens"}</small></div><div><b>{formatPounds(item.pricePence)}</b><button onClick={() => addToCart(item)}>Add</button></div></article>) : <p>No available items in this category.</p>}</div>) : <p className="panel">This restaurant has no active menu items yet.</p>}</section>}

    {view === "basket" && <section className="panel"><h2>Your basket</h2>{cart.length ? cart.map((line) => <article className="basket-line" key={line.item.id}><span>{line.quantity} × {line.item.name}</span><div><button onClick={() => updateQuantity(line.item.id, line.quantity - 1)}>-</button><button onClick={() => updateQuantity(line.item.id, line.quantity + 1)}>+</button></div><b>{formatPounds(line.item.pricePence * line.quantity)}</b></article>) : <p>Your basket is empty.</p>}<h3>Estimated subtotal {formatPounds(totals.subtotal)}</h3><button disabled={!cart.length} onClick={() => setView("checkout")}>Checkout</button></section>}

    {view === "checkout" && <section className="panel"><h2>Checkout</h2>{!user && <button onClick={() => void loginDemo()}>Use seeded customer login</button>}<form onSubmit={(event) => void createOrderAndIntent(event)} className="checkout-form"><input name="name" placeholder="Full name" defaultValue={user?.fullName ?? "Casey Customer"} required /><input name="email" type="email" placeholder="Email" defaultValue={user?.email ?? "customer@marsh-eats.test"} required /><input name="phone" placeholder="Phone" defaultValue="+447700900111" /><select name="fulfilmentType" defaultValue="collection"><option value="collection">Collection</option><option value="delivery">Delivery</option></select><input name="line1" placeholder="Delivery line 1" defaultValue="12 Beach Walk" /><input name="town" placeholder="Town" defaultValue="Whitstable" /><input name="postcode" placeholder="Postcode" defaultValue="CT5 2BP" /><textarea name="notes" placeholder="Order notes" /><button disabled={!cart.length}>Create secure payment</button></form>{order && <div className="summary"><p>Server total: <strong>{formatPounds(order.total_pence)}</strong></p><p>RNLI contribution: {formatPounds(order.rnli_contribution_pence)}</p><div id="card-element" className="card-element" /><button onClick={() => void pay()} disabled={!clientSecret}>Pay with Stripe test card</button><small>Try 4242 4242 4242 4242, any future expiry, any CVC.</small></div>}{paymentMessage && <p className="alert">{paymentMessage}</p>}</section>}

    {view === "confirmation" && <section className="panel"><h2>Order confirmed</h2><p>Thanks — Stripe confirmed payment and the restaurant queue will update from the paid order event.</p><button onClick={() => setView("browse")}>Back to restaurants</button></section>}

    <nav className="tabbar"><button onClick={() => setView("browse")}>Browse</button><button onClick={() => setView("basket")}>Basket ({totals.count})</button><button onClick={() => setView("checkout")}>Checkout</button></nav>
  </main>;
}
