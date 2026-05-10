"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
interface User { id: string; email: string; full_name?: string; fullName?: string; role: string; }
interface Restaurant { id: string; name: string; slug: string; cuisineTypes: string[]; status: string; isAcceptingOrders: boolean; minimumOrderPence: number; town: string; }
interface ReportRow { restaurant_id: string; restaurant_name: string; order_count: number; gross_order_value_pence: number; marsh_eats_commission_pence: number; restaurant_payable_pence: number; rnli_contribution_pence: number; }
interface Report { totals: { orderCount: number; grossOrderValuePence: number; marshEatsCommissionPence: number; restaurantPayablePence: number; rnliContributionPence: number }; restaurants: ReportRow[]; }
function money(pence: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100); }
async function request<T>(path: string, token: string, options: RequestInit = {}) { const response = await fetch(`${apiBase}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } }); if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Request failed"); return response.json() as Promise<T>; }

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() { const data = await fetch(`${apiBase}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@marsh-eats.test", password: "MarshEats123!" }) }).then((r) => r.json()) as { accessToken: string }; setToken(data.accessToken); localStorage.setItem("admin-token", data.accessToken); }
  async function refresh(activeToken = token) {
    if (!activeToken) return; setLoading(true); setError(null);
    try {
      const [userData, restaurantData, reportData] = await Promise.all([
        request<{ users: User[] }>("/api/v1/admin/users", activeToken),
        request<{ restaurants: Restaurant[] }>("/api/v1/restaurants?includeInactive=true", activeToken),
        request<Report>("/api/v1/admin/rnli-report", activeToken)
      ]);
      setUsers(userData.users); setRestaurants(restaurantData.restaurants); setReport(reportData);
    } catch (err) { setError(err instanceof Error ? err.message : "Admin data failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { const stored = localStorage.getItem("admin-token"); if (stored) { setToken(stored); void refresh(stored); } }, []);

  async function createRestaurant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget);
    const owner = String(form.get("ownerUserId"));
    await request("/api/v1/admin/restaurants", token, { method: "POST", body: JSON.stringify({ ownerUserId: owner, name: form.get("name"), slug: form.get("slug"), status: form.get("status"), cuisineTypes: String(form.get("cuisineTypes")).split(",").map((item) => item.trim()).filter(Boolean), description: form.get("description"), addressLine1: form.get("addressLine1"), town: form.get("town"), county: "Kent", postcode: form.get("postcode"), minimumOrderPence: Number(form.get("minimumOrderPence")), collectionEnabled: true, deliveryEnabled: true, isAcceptingOrders: form.get("status") === "active", estimatedPrepMinutes: Number(form.get("estimatedPrepMinutes")) }) });
    event.currentTarget.reset(); await refresh();
  }
  async function toggleRestaurant(restaurant: Restaurant) { if (!token) return; await request(`/api/v1/admin/restaurants/${restaurant.id}`, token, { method: "PATCH", body: JSON.stringify({ status: restaurant.status === "active" ? "suspended" : "active", isAcceptingOrders: restaurant.status !== "active" }) }); await refresh(); }
  async function createCategory(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget); await request(`/api/v1/admin/restaurants/${form.get("restaurantId")}/menu-categories`, token, { method: "POST", body: JSON.stringify({ name: form.get("name"), sortOrder: Number(form.get("sortOrder")) }) }); event.currentTarget.reset(); }
  async function createItem(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!token) return; const form = new FormData(event.currentTarget); await request(`/api/v1/admin/menu-categories/${form.get("categoryId")}/items`, token, { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description"), pricePence: Number(form.get("pricePence")), allergens: String(form.get("allergens")).split(",").map((item) => item.trim()).filter(Boolean), isAvailable: true }) }); event.currentTarget.reset(); }

  const owners = users.filter((user) => user.role === "restaurant_owner");
  return <main><p className="eyebrow">Platform controls</p><h1>Admin dashboard</h1><button onClick={() => token ? void refresh() : void login()}>{token ? "Refresh live data" : "Use seeded admin login"}</button>{loading && <p className="panel">Loading admin workspace…</p>}{error && <p className="alert">{error}</p>}{report && <section className="metrics"><article><span>Gross orders</span><strong>{money(report.totals.grossOrderValuePence)}</strong></article><article><span>Marsh Eats commission</span><strong>{money(report.totals.marshEatsCommissionPence)}</strong></article><article><span>Restaurant payable</span><strong>{money(report.totals.restaurantPayablePence)}</strong></article><article><span>RNLI contribution</span><strong>{money(report.totals.rnliContributionPence)}</strong></article></section>}<section className="grid"><div className="panel"><h2>Restaurant onboarding</h2><form onSubmit={(event) => void createRestaurant(event)}><input name="name" placeholder="Restaurant name" required /><input name="slug" placeholder="restaurant-slug" required /><input name="cuisineTypes" placeholder="Cuisine types, comma separated" /><textarea name="description" placeholder="Description" /><input name="addressLine1" placeholder="Address line 1" required /><input name="town" placeholder="Town" required /><input name="postcode" placeholder="Postcode" required /><input name="minimumOrderPence" type="number" placeholder="Minimum order pence" defaultValue="1000" /><input name="estimatedPrepMinutes" type="number" placeholder="Prep minutes" defaultValue="30" /><select name="ownerUserId">{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.email}</option>)}</select><select name="status" defaultValue="draft"><option value="draft">Draft</option><option value="active">Active</option><option value="suspended">Suspended</option></select><button>Create restaurant</button></form></div><div className="panel"><h2>Restaurants</h2>{restaurants.map((restaurant) => <article key={restaurant.id} className="row"><strong>{restaurant.name}</strong><span>{restaurant.status} · {restaurant.town}</span><button onClick={() => void toggleRestaurant(restaurant)}>{restaurant.status === "active" ? "Deactivate" : "Activate"}</button></article>)}{!restaurants.length && <p>No restaurants yet.</p>}</div><div className="panel"><h2>Create menu category</h2><form onSubmit={(event) => void createCategory(event)}><select name="restaurantId">{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select><input name="name" placeholder="Category name" required /><input name="sortOrder" type="number" defaultValue="0" /><button>Add category</button></form><p className="hint">Use the menu API response to copy a category id when adding an item during local MVP testing.</p></div><div className="panel"><h2>Create menu item</h2><form onSubmit={(event) => void createItem(event)}><input name="categoryId" placeholder="Category UUID" required /><input name="name" placeholder="Item name" required /><textarea name="description" placeholder="Description" /><input name="pricePence" type="number" placeholder="Price pence" required /><input name="allergens" placeholder="Allergens, comma separated" /><button>Add item</button></form></div><div className="panel report"><h2>RNLI report by restaurant</h2>{report?.restaurants.map((row) => <article key={row.restaurant_id} className="row"><strong>{row.restaurant_name}</strong><span>{row.order_count} orders · RNLI {money(row.rnli_contribution_pence)} · gross {money(row.gross_order_value_pence)}</span></article>)}</div></section></main>;
}
