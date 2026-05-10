"use client";

import { useEffect, useMemo, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const seededLogin = { email: "owner.harbour@marsh-eats.test", password: "MarshEats123!" };

type Status = "pending_payment" | "paid" | "sent_to_restaurant" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" | "failed";
interface User { id: string; role: string; fullName: string; email: string; }
interface Restaurant { id: string; name: string; }
interface OrderItem { name: string; quantity: number; unitPricePence: number; lineTotalPence: number; }
interface Order { id: string; status: Status; fulfilment_type: string; total_pence: number; customer_name?: string; customer_email?: string; customer_phone?: string; customer_note?: string; payment_status?: string; items: OrderItem[]; created_at: string; }

function money(pence: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100); }
async function api<T>(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Request failed");
  return response.json() as Promise<T>;
}

export default function RestaurantDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [connection, setConnection] = useState("offline");
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => [
    { title: "New / paid", statuses: ["paid", "sent_to_restaurant"] },
    { title: "Accepted / preparing", statuses: ["accepted", "preparing"] },
    { title: "Ready", statuses: ["ready"] },
    { title: "Completed / recent", statuses: ["completed", "cancelled", "failed"] }
  ], []);

  async function login() {
    const data = await fetch(`${apiBase}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seededLogin) }).then((r) => r.json()) as { user: User; accessToken: string };
    setUser(data.user); setToken(data.accessToken); localStorage.setItem("restaurant-token", data.accessToken);
  }

  useEffect(() => { const stored = localStorage.getItem("restaurant-token"); if (stored) setToken(stored); }, []);
  useEffect(() => { if (!token) return; api<{ restaurants: Restaurant[] }>("/api/v1/account/restaurants", token).then((data) => { setRestaurants(data.restaurants); setRestaurantId(data.restaurants[0]?.id ?? null); }).catch((err: Error) => setError(err.message)); }, [token]);
  useEffect(() => { if (!token || !restaurantId) return; api<{ orders: Order[] }>(`/api/v1/restaurants/${restaurantId}/orders`, token).then((data) => setOrders(data.orders)).catch((err: Error) => setError(err.message)); }, [token, restaurantId]);

  useEffect(() => {
    if (!token || !restaurantId) return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      setConnection("connecting");
      source = new EventSource(`${apiBase}/restaurants/${restaurantId}/orders/events?token=${encodeURIComponent(token)}`);
      source.addEventListener("connected", () => setConnection("live"));
      source.addEventListener("order-status", () => {
        setConnection("live");
        api<{ orders: Order[] }>(`/api/v1/restaurants/${restaurantId}/orders`, token).then((data) => setOrders(data.orders)).catch((err: Error) => setError(err.message));
      });
      source.onerror = () => { setConnection("reconnecting"); source?.close(); timer = setTimeout(connect, 2500); };
    };
    connect();
    return () => { source?.close(); if (timer) clearTimeout(timer); };
  }, [token, restaurantId]);

  async function changeStatus(order: Order, status: Status) {
    if (!token) return;
    try {
      const updated = await api<Order>(`/api/v1/orders/${order.id}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: updated.status } : item));
    } catch (err) { setError(err instanceof Error ? err.message : "Status update failed"); }
  }

  return <main className="dashboard"><header><p>Restaurant operations</p><h1>Live orders</h1><button onClick={() => void login()}>{user ? `${user.fullName} signed in` : "Use seeded owner login"}</button><span className={`pill ${connection}`}>{connection}</span></header>{error && <p className="alert">{error}</p>}<select value={restaurantId ?? ""} onChange={(event) => setRestaurantId(event.target.value)}>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select><section className="kanban">{columns.map((column) => <article key={column.title}><h2>{column.title}</h2>{orders.filter((order) => column.statuses.includes(order.status)).map((order) => <div className="order" key={order.id}><strong>{order.customer_name ?? "Customer"}</strong><small>{order.customer_email} · {order.customer_phone}</small><p>{order.fulfilment_type} · {money(order.total_pence)} · {order.status}</p><ul>{order.items.map((item) => <li key={`${order.id}-${item.name}`}>{item.quantity} × {item.name}</li>)}</ul>{order.customer_note && <p>Note: {order.customer_note}</p>}<div className="actions"><button onClick={() => void changeStatus(order, "accepted")}>Accept</button><button onClick={() => void changeStatus(order, "preparing")}>Preparing</button><button onClick={() => void changeStatus(order, "ready")}>Ready</button><button onClick={() => void changeStatus(order, "completed")}>Complete</button></div></div>)}{!orders.filter((order) => column.statuses.includes(order.status)).length && <p>No orders in this lane.</p>}</article>)}</section></main>;
}
