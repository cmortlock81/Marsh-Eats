(function () {
  "use strict";

  const config = window.MarshEatsBridge || {};
  const tokenKey = "marshEats.accessToken";
  const userKey = "marshEats.user";
  const basketKey = "marshEats.basket";
  const state = { stripe: null, elements: null, card: null, sse: null };

  const money = (pence) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((Number(pence || 0) / 100));
  const qs = (root, selector) => root.querySelector(selector);
  const qsa = (root, selector) => Array.from(root.querySelectorAll(selector));
  const html = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function getToken() { return localStorage.getItem(tokenKey) || ""; }
  function setToken(token) { token ? localStorage.setItem(tokenKey, token) : localStorage.removeItem(tokenKey); }
  function getUser() { try { return JSON.parse(localStorage.getItem(userKey) || "null"); } catch { return null; } }
  function setUser(user) { user ? localStorage.setItem(userKey, JSON.stringify(user)) : localStorage.removeItem(userKey); }
  function getBasket() { try { return JSON.parse(localStorage.getItem(basketKey) || "[]"); } catch { return []; } }
  function setBasket(items) { localStorage.setItem(basketKey, JSON.stringify(items)); window.dispatchEvent(new CustomEvent("marsh-eats:basket")); }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ "Accept": "application/json" }, opts.headers || {});
    if (!["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) headers["X-WP-Nonce"] = config.nonce;
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";

    const response = await fetch(`${String(config.restUrl || "").replace(/\/$/, "")}${path}`, Object.assign({}, opts, { headers }));
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = data.message || data.error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  function currentRoute(root) {
    const appBase = config.appBasePath || "/app";
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    const dataRoute = root.dataset.route || "";
    if (dataRoute && dataRoute !== "/") return `${appBase}${dataRoute}`.replace(/\/+/g, "/");
    return path;
  }

  function nav(path) { window.history.pushState({}, "", path); boot(); }

  function panel(root, title, body) {
    const mount = qs(root, "[data-marsh-eats-mount]") || root;
    mount.innerHTML = `<p class="marsh-eats-eyebrow">Marsh Eats</p><h1>${html(title)}</h1>${body}`;
    bindLinks(root);
  }

  function errorPanel(root, err) {
    panel(root, "Something went wrong", `<p class="marsh-eats-alert">${html(err.message || err)}</p><button data-action="reload">Try again</button>`);
    qs(root, "[data-action='reload']")?.addEventListener("click", () => boot());
  }

  function bindLinks(root) {
    qsa(root, "a[href^='/app'], a[href*='/app']").forEach((link) => {
      link.addEventListener("click", (event) => {
        const url = new URL(link.href, window.location.origin);
        if (url.origin === window.location.origin) { event.preventDefault(); nav(url.pathname); }
      });
    });
  }

  async function renderRestaurants(root) {
    panel(root, "Restaurants", `<div class="marsh-eats-grid"><div class="marsh-eats-loading">Loading restaurants…</div></div>`);
    const data = await api("/restaurants");
    const restaurants = data.restaurants || [];
    const cards = restaurants.length ? restaurants.map((restaurant) => `
      <article class="marsh-eats-card marsh-eats-restaurant-card">
        <div class="marsh-eats-image" ${restaurant.logoUrl ? `style="background-image:url('${html(restaurant.logoUrl)}')"` : ""}></div>
        <h2>${html(restaurant.name)}</h2>
        <p>${html((restaurant.cuisineTypes || [restaurant.cuisine || "Local"]).join(" · "))}</p>
        <p>${html(restaurant.description || "Fresh local food")}</p>
        <small>${restaurant.deliveryEnabled ? "Delivery" : "Collection only"} · Min ${money(restaurant.minimumOrderPence)}</small>
        <button data-restaurant-slug="${html(restaurant.slug)}" data-restaurant-id="${html(restaurant.id)}">View menu</button>
      </article>`).join("") : `<p class="marsh-eats-panel">No restaurants are accepting orders right now.</p>`;
    panel(root, "Restaurants", `<div class="marsh-eats-grid">${cards}</div>`);
    qsa(root, "[data-restaurant-slug]").forEach((button) => button.addEventListener("click", () => nav(`${config.appBasePath}/restaurants/${button.dataset.restaurantSlug}`)));
  }

  async function findRestaurantBySlug(slug) {
    try { return (await api(`/restaurants/slug/${encodeURIComponent(slug)}`)).restaurant; }
    catch (err) {
      const data = await api("/restaurants");
      return (data.restaurants || []).find((restaurant) => restaurant.slug === slug);
    }
  }

  async function renderMenu(root, slugOrId) {
    panel(root, "Menu", `<div class="marsh-eats-loading">Loading menu…</div>`);
    const restaurant = root.dataset.restaurantId ? { id: root.dataset.restaurantId, name: "Restaurant" } : await findRestaurantBySlug(slugOrId || root.dataset.restaurantSlug);
    if (!restaurant?.id) throw new Error("Restaurant not found");
    const data = await api(`/restaurants/${encodeURIComponent(restaurant.id)}/menu`);
    const categories = data.categories || [];
    const body = `<div class="marsh-eats-stack">${categories.map((category) => `
      <section class="marsh-eats-panel"><h2>${html(category.name)}</h2>
      ${(category.items || []).map((item) => `
        <article class="marsh-eats-row"><div><strong>${html(item.name)}</strong><p>${html(item.description || "")}</p><small>${html((item.allergens || []).join(", "))}</small></div><div><strong>${money(item.pricePence)}</strong><button data-add-item='${html(JSON.stringify({ restaurantId: restaurant.id, restaurantName: restaurant.name, menuItemId: item.id, name: item.name, pricePence: item.pricePence, quantity: 1 }))}'>Add</button></div></article>`).join("")}
      </section>`).join("")}</div>`;
    panel(root, data.restaurant?.name || restaurant.name || "Menu", body || `<p>No menu is available.</p>`);
    qsa(root, "[data-add-item]").forEach((button) => button.addEventListener("click", () => {
      const item = JSON.parse(button.dataset.addItem);
      const basket = getBasket();
      const existing = basket.find((line) => line.menuItemId === item.menuItemId);
      if (existing) existing.quantity += 1; else basket.push(item);
      setBasket(basket);
      button.textContent = "Added";
    }));
  }

  function renderBasket(root) {
    const basket = getBasket();
    const total = basket.reduce((sum, item) => sum + Number(item.pricePence || 0) * Number(item.quantity || 0), 0);
    const body = basket.length ? `<div class="marsh-eats-stack">${basket.map((item, index) => `
      <article class="marsh-eats-row"><div><strong>${html(item.name)}</strong><p>${money(item.pricePence)} each</p></div><div class="marsh-eats-qty"><button data-qty="${index}" data-delta="-1">−</button><span>${html(item.quantity)}</span><button data-qty="${index}" data-delta="1">+</button><button data-remove="${index}">Remove</button></div></article>`).join("")}
      <div class="marsh-eats-total"><strong>Estimated basket</strong><strong>${money(total)}</strong></div><small>Final trusted totals are calculated by the Marsh Eats API.</small><button data-checkout>Checkout</button></div>` : `<p>Your basket is empty.</p><a class="marsh-eats-button" href="${config.appBasePath}/restaurants">Browse restaurants</a>`;
    panel(root, "Basket", body);
    qsa(root, "[data-qty]").forEach((button) => button.addEventListener("click", () => {
      const items = getBasket();
      items[Number(button.dataset.qty)].quantity += Number(button.dataset.delta);
      setBasket(items.filter((item) => item.quantity > 0)); renderBasket(root);
    }));
    qsa(root, "[data-remove]").forEach((button) => button.addEventListener("click", () => { const items = getBasket(); items.splice(Number(button.dataset.remove), 1); setBasket(items); renderBasket(root); }));
    qs(root, "[data-checkout]")?.addEventListener("click", () => nav(`${config.appBasePath}/checkout`));
  }

  async function loadStripeJs() {
    if (window.Stripe) return window.Stripe(config.stripePublishableKey);
    await new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "https://js.stripe.com/v3/"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return window.Stripe(config.stripePublishableKey);
  }

  async function renderCheckout(root) {
    const basket = getBasket();
    if (!basket.length) { renderBasket(root); return; }
    if (!getToken()) { renderLogin(root, `${config.appBasePath}/checkout`); return; }
    panel(root, "Checkout", `<form class="marsh-eats-form" data-checkout-form>
      <input name="name" placeholder="Full name" value="${html(getUser()?.fullName || "")}" required>
      <input name="email" type="email" placeholder="Email" value="${html(getUser()?.email || "")}" required>
      <input name="phone" placeholder="Phone">
      <select name="fulfilmentType"><option value="collection">Collection</option><option value="delivery">Delivery</option></select>
      <input name="line1" placeholder="Delivery line 1"><input name="town" placeholder="Town"><input name="postcode" placeholder="Postcode">
      <textarea name="notes" placeholder="Order notes"></textarea><button>Create secure payment</button></form><div data-payment></div>`);
    qs(root, "[data-checkout-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const restaurantId = basket[0].restaurantId;
      const order = await api("/orders", { method: "POST", body: JSON.stringify({ restaurantId, fulfilmentType: form.get("fulfilmentType"), deliveryAddress: { line1: form.get("line1") || "Collection", town: form.get("town") || "Kent", postcode: form.get("postcode") || "CT1" }, customerContact: { name: form.get("name"), email: form.get("email"), phone: form.get("phone") }, notes: form.get("notes"), idempotencyKey: uuid(), items: basket.map((item) => ({ menuItemId: item.menuItemId, quantity: Number(item.quantity) })) }) });
      const created = order.order || order;
      const intent = await api(`/orders/${created.id}/payment-intents`, { method: "POST", body: JSON.stringify({ idempotencyKey: uuid() }) });
      await renderPayment(root, created.id, intent.clientSecret);
    });
  }

  async function renderPayment(root, orderId, clientSecret) {
    const target = qs(root, "[data-payment]");
    if (!config.stripePublishableKey) { target.innerHTML = `<p class="marsh-eats-alert">Stripe publishable key is not configured.</p>`; return; }
    state.stripe = await loadStripeJs();
    state.elements = state.stripe.elements({ clientSecret });
    state.card = state.elements.create("payment");
    target.innerHTML = `<div id="marsh-eats-payment-element" class="marsh-eats-payment-element"></div><button data-pay>Pay now</button><p class="marsh-eats-muted">Use Stripe test card 4242 4242 4242 4242.</p><div data-pay-message></div>`;
    state.card.mount("#marsh-eats-payment-element");
    qs(target, "[data-pay]").addEventListener("click", async () => {
      const result = await state.stripe.confirmPayment({ elements: state.elements, redirect: "if_required" });
      if (result.error) qs(target, "[data-pay-message]").innerHTML = `<p class="marsh-eats-alert">${html(result.error.message)}</p>`;
      else { setBasket([]); nav(`${config.appBasePath}/order-confirmation/${orderId}`); }
    });
  }

  async function renderConfirmation(root, orderId) {
    const body = orderId ? `<div class="marsh-eats-loading">Loading order…</div>` : `<p>Thanks — your payment was confirmed.</p>`;
    panel(root, "Order confirmation", body);
    if (orderId && getToken()) {
      const data = await api(`/orders/${encodeURIComponent(orderId)}`);
      panel(root, "Order confirmation", `<p>Order <strong>${html(orderId)}</strong> status: <strong>${html(data.order?.status || "created")}</strong></p><a class="marsh-eats-button" href="${config.appBasePath}/restaurants">Order again</a>`);
    }
  }

  function renderLogin(root, afterLogin) {
    panel(root, "Login", `<form class="marsh-eats-form" data-login-form><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" required><button>Login</button></form><hr><form class="marsh-eats-form" data-register-form><input name="fullName" placeholder="Full name" required><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" required><button>Create account</button></form><div data-auth-message></div>`);
    const routeFor = (user) => user?.role === "admin" ? config.adminDashboardPath : user?.role === "restaurant_owner" ? config.restaurantDashboardPath : (afterLogin || config.appBasePath);
    qs(root, "[data-login-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); setToken(data.accessToken); setUser(data.user); nav(routeFor(data.user)); });
    qs(root, "[data-register-form]").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const data = await api("/auth/register", { method: "POST", body: JSON.stringify({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password") }) }); setToken(data.accessToken); setUser(data.user); nav(routeFor(data.user)); });
  }

  async function renderRestaurantDashboard(root) {
    const user = getUser();
    if (!getToken() || !["restaurant_owner", "restaurant_staff", "admin"].includes(user?.role)) { renderLogin(root, config.restaurantDashboardPath); return; }
    panel(root, "Restaurant orders", `<form class="marsh-eats-form-inline"><input data-restaurant-id-input placeholder="Restaurant UUID" required><button data-load-orders>Load orders</button></form><p data-sse-status>Not connected</p><div data-orders class="marsh-eats-stack"></div>`);
    qs(root, "[data-load-orders]").addEventListener("click", async (event) => { event.preventDefault(); await loadOrders(root, qs(root, "[data-restaurant-id-input]").value); });
  }

  async function loadOrders(root, restaurantId) {
    const data = await api(`/restaurants/${encodeURIComponent(restaurantId)}/orders`);
    const render = (orders) => { qs(root, "[data-orders]").innerHTML = (orders || []).map((order) => `<article class="marsh-eats-card"><h2>Order ${html(String(order.id).slice(0, 8))}</h2><p>Status: <strong>${html(order.status)}</strong></p><p>${money(order.total_pence)}</p><select data-order-status="${html(order.id)}"><option>${html(order.status)}</option><option value="accepted">accepted</option><option value="preparing">preparing</option><option value="ready">ready</option><option value="completed">completed</option></select></article>`).join("") || `<p>No active orders.</p>`; };
    render(data.orders || []);
    qsa(root, "[data-order-status]").forEach((select) => select.addEventListener("change", async () => { await api(`/orders/${select.dataset.orderStatus}/status`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); await loadOrders(root, restaurantId); }));
    connectSse(root, restaurantId);
  }

  async function connectSse(root, restaurantId) {
    if (state.sse) state.sse.close();
    const cfg = await api(`/restaurants/${encodeURIComponent(restaurantId)}/orders/events-url`);
    const url = new URL(cfg.url); url.searchParams.set("token", getToken());
    const status = qs(root, "[data-sse-status]");
    state.sse = new EventSource(url.toString());
    state.sse.addEventListener("connected", () => { status.textContent = "Live connection active"; });
    state.sse.addEventListener("order-status", () => loadOrders(root, restaurantId));
    state.sse.onerror = () => { status.textContent = "Live connection lost; reconnecting…"; setTimeout(() => connectSse(root, restaurantId), 5000); };
  }

  async function renderAdmin(root, reportOnly) {
    const user = getUser();
    if (!getToken() || user?.role !== "admin") { renderLogin(root, config.adminDashboardPath); return; }
    panel(root, reportOnly ? "RNLI report" : "Admin dashboard", `<div class="marsh-eats-tabs"><button data-admin="restaurants">Restaurants</button><button data-admin="rnli">RNLI report</button></div><div data-admin-view></div>`);
    qsa(root, "[data-admin]").forEach((button) => button.addEventListener("click", () => button.dataset.admin === "rnli" ? loadRnli(root) : loadAdminRestaurants(root)));
    reportOnly ? await loadRnli(root) : await loadAdminRestaurants(root);
  }

  async function loadAdminRestaurants(root) {
    const target = qs(root, "[data-admin-view]"); target.innerHTML = `<div class="marsh-eats-loading">Loading restaurants…</div>`;
    const data = await api("/admin/restaurants");
    target.innerHTML = `<div class="marsh-eats-grid">${(data.restaurants || []).map((r) => `<article class="marsh-eats-card"><h2>${html(r.name)}</h2><p>${html(r.status)}</p><small>${html(r.slug)}</small></article>`).join("")}</div>`;
  }

  async function loadRnli(root) {
    const target = qs(root, "[data-admin-view]");
    target.innerHTML = `<form class="marsh-eats-form-inline" data-rnli-form><input name="from" type="date"><input name="to" type="date"><input name="restaurantId" placeholder="Restaurant UUID"><button>Filter</button></form><div data-rnli-output></div>`;
    const submit = async (event) => { if (event) event.preventDefault(); const form = new FormData(qs(root, "[data-rnli-form]")); const params = new URLSearchParams(Array.from(form.entries()).filter(([, value]) => value)); const data = await api(`/admin/reports/rnli?${params}`); qs(root, "[data-rnli-output]").innerHTML = `<div class="marsh-eats-total"><span>RNLI contribution</span><strong>${money(data.totals?.rnliContributionPence || data.totals?.rnli_contribution_pence)}</strong></div><div class="marsh-eats-grid">${(data.restaurants || []).map((r) => `<article class="marsh-eats-card"><h2>${html(r.restaurantName || r.restaurant_name)}</h2><p>Orders: ${html(r.orderCount || r.order_count || 0)}</p><p>RNLI: ${money(r.rnliContributionPence || r.rnli_contribution_pence)}</p></article>`).join("")}</div>`; };
    qs(root, "[data-rnli-form]").addEventListener("submit", submit); await submit();
  }

  async function renderAccount(root) {
    const user = getUser();
    panel(root, "Account", user ? `<p>${html(user.email)}</p><p>Role: ${html(user.role)}</p><button data-logout>Logout</button>` : `<p>You are not logged in.</p><a class="marsh-eats-button" href="${config.appBasePath}/login">Login</a>`);
    qs(root, "[data-logout]")?.addEventListener("click", () => { setToken(""); setUser(null); nav(`${config.appBasePath}/login`); });
  }

  async function boot() {
    const roots = qsa(document, ".marsh-eats-app");
    for (const root of roots) {
      try {
        const route = currentRoute(root);
        if (route.includes("/restaurant/orders")) await renderRestaurantDashboard(root);
        else if (route.includes("/admin/reports/rnli")) await renderAdmin(root, true);
        else if (route.includes("/admin")) await renderAdmin(root, false);
        else if (route.includes("/checkout")) await renderCheckout(root);
        else if (route.includes("/basket")) renderBasket(root);
        else if (route.includes("/login")) renderLogin(root);
        else if (route.includes("/account")) await renderAccount(root);
        else if (route.includes("/order-confirmation/")) await renderConfirmation(root, route.split("/").pop());
        else if (route.includes("/restaurants/") || root.dataset.view === "restaurant_menu") await renderMenu(root, route.split("/").pop());
        else await renderRestaurants(root);
      } catch (err) { errorPanel(root, err); }
    }
  }

  window.addEventListener("popstate", boot);
  document.addEventListener("DOMContentLoaded", boot);
}());
