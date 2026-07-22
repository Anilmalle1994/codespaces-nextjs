"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wwmedeounvgaesuqofaq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WmXY8LkHqhh-BeMnNDHA1w_kkOx4Va8";

export default function Home() {
  useEffect(() => {
    const configured = SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
    const db = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
    let currentUser = null;
    let profile = { role: "staff" };
    let materialRows = [];
    let cachedOrders = [];

    const $ = (s) => document.querySelector(s);
    const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    const safe = (v) => String(v ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const whatsapp = (phone, message) => window.open(`https://wa.me/91${String(phone).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(message)}`, "_blank");

    const note = (error) => {
      const detail = typeof error === "string" ? error : error?.message || error?.error_description || "";
      const authNote = $("#auth-note");
      if (authNote) authNote.textContent = detail || "Supabase could not send the email. Check Authentication > Sign In / Providers > Email and fix or turn off Custom SMTP.";
    };

    function bindEvents() {
      $("#staff-login")?.addEventListener("click", () => { $("#public-site")?.classList.add("hidden"); $("#login-screen")?.classList.remove("hidden"); });
      $("#back-public")?.addEventListener("click", () => { $("#login-screen")?.classList.add("hidden"); $("#public-site")?.classList.remove("hidden"); });
      $("#public-menu")?.addEventListener("click", () => document.querySelector(".public-nav nav")?.classList.toggle("mobile-open"));
      $("#login-form")?.addEventListener("submit", requestOtp);
      $("#otp-form")?.addEventListener("submit", verifyOtp);
      $("#change-email")?.addEventListener("click", () => { $("#otp-form")?.classList.add("hidden"); $("#login-form")?.classList.remove("hidden"); });
      const leave = async () => { await db?.auth.signOut(); location.reload(); };
      $("#logout")?.addEventListener("click", leave);
      $("#settings-logout")?.addEventListener("click", leave);
      document.querySelectorAll("[data-page],[data-go]").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page || b.dataset.go)));
      $("#menu-toggle")?.addEventListener("click", () => $("#app")?.classList.toggle("menu-open"));
      $("#order-form")?.addEventListener("submit", saveOrder);
      $("#search-form")?.addEventListener("submit", searchOrders);
      $("#vendor-form")?.addEventListener("submit", saveVendor);
      $("#purchase-vendor")?.addEventListener("change", updateMaterialOptions);
      $("#purchase-material")?.addEventListener("change", updatePurchaseAmount);
      $("#purchase-form")?.addEventListener("input", updatePurchaseAmount);
      $("#purchase-form")?.addEventListener("submit", savePurchase);
      $("#customer-search")?.addEventListener("input", () => renderCustomers(cachedOrders));
      $("#export-customers")?.addEventListener("click", exportCustomers);
      $("#report-filter")?.addEventListener("click", renderReports);
    }

    async function requestOtp(e) {
      e.preventDefault();
      if (!db) return note("Please connect Supabase first.");
      const email = $("#login-email")?.value.trim();
      try {
        const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) return note(error);
        $("#login-form")?.classList.add("hidden");
        $("#otp-form")?.classList.remove("hidden");
        note("An 8-digit code was sent to your email.");
      } catch (error) {
        note(/fetch|network/i.test(error?.message || "") ? "Cannot reach Supabase. Check the Project URL and publishable key in app.js." : error);
      }
    }

    async function verifyOtp(e) {
      e.preventDefault();
      const email = $("#login-email")?.value.trim();
      const token = $("#otp")?.value.trim();
      const { data, error } = await db.auth.verifyOtp({ email, token, type: "email" });
      if (error) return note(error.message);
      await enterApp(data.user);
    }

    async function enterApp(user) {
      currentUser = user;
      const res = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      profile = res.data || { role: "staff" };
      $("#public-site")?.classList.add("hidden");
      $("#login-screen")?.classList.add("hidden");
      $("#app")?.classList.remove("hidden");
      if ($("#user-email")) $("#user-email").textContent = user.email;
      if ($("#settings-email")) $("#settings-email").value = user.email;
      if (profile.role !== "admin") document.querySelectorAll(".admin-only").forEach((x) => x.classList.add("hidden"));
      await refreshDashboard();
      if (profile.role === "admin") await loadMaterials();
      const scanned = new URLSearchParams(location.hash.replace(/^#/, "")).get("order");
      if (scanned) {
        showPage("delivery");
        if ($("#search-term")) $("#search-term").value = scanned;
        $("#search-form")?.requestSubmit();
      }
    }

    function showPage(id) {
      document.querySelectorAll(".page").forEach((x) => x.classList.toggle("active", x.id === id));
      document.querySelectorAll(".nav-link").forEach((x) => x.classList.toggle("active", x.dataset.page === id));
      $("#app")?.classList.remove("menu-open");
      if (id === "customers") renderCustomers(cachedOrders);
      if (id === "reports") renderReports();
      if (id === "delivery") $("#search-term")?.focus();
    }

    async function refreshDashboard() {
      const { data: orders, error } = await db.from("orders").select("*").order("created_at", { ascending: false });
      if (error) return console.error(error);
      cachedOrders = orders || [];
      const today = new Date().toDateString();
      const open = cachedOrders.filter((o) => o.status === "open");
      const ready = cachedOrders.filter((o) => o.status === "ready");
      const delivered = cachedOrders.filter((o) => o.status === "delivered");
      $("#today-count").textContent = cachedOrders.filter((o) => new Date(o.created_at).toDateString() === today).length;
      $("#open-count").textContent = open.length;
      $("#ready-count").textContent = ready.length;
      $("#delivered-count").textContent = delivered.length;
      $("#balance-total").textContent = money(cachedOrders.filter((o) => o.status !== "delivered").reduce((n, o) => n + Number(o.amount) - Number(o.advance), 0));
      $("#sales-total").textContent = money(cachedOrders.reduce((n, o) => n + Number(o.amount), 0));
      $("#recent-orders").innerHTML = cachedOrders.length ? cachedOrders.slice(0, 4).map((o) => orderHtml(o)).join("") : "No orders yet. Add your first printing project.";
      renderChart(cachedOrders);
    }

    function renderChart(orders) {
      const counts = Array(10).fill(0);
      orders.forEach((o) => {
        const ago = Math.min(9, Math.floor((Date.now() - new Date(o.created_at)) / 86400000 / 3));
        counts[9 - ago]++;
      });
      if ($("#order-chart")) {
        $("#order-chart").innerHTML = counts.map((n) => `<i style=\"height:${Math.max(10, n * 24)}px\" title=\"${n} orders\"></i>`).join("");
      }
    }

    function orderHtml(o, delivery = false) {
      const balance = Number(o.amount) - Number(o.advance);
      const qrUrl = `${location.origin}${location.pathname}#order=${encodeURIComponent(o.order_code)}`;
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=105x105&data=${encodeURIComponent(qrUrl)}`;
      return `<article class=\"order-card\"><h3>${safe(o.client_name)} <small>• ${safe(o.order_code)}</small></h3><div class=\"details\"><div><small>Phone</small><b>${safe(o.contact_number)}</b></div><div><small>Work</small><b>${safe((o.work || []).join(", "))}</b></div><div><small>Balance</small><b>${money(balance)}</b></div></div>${delivery ? `<details><summary>Show QR code</summary><img src=\"${qr}\" alt=\"QR code\" width=\"105\" height=\"105\"></details>` : ""}${delivery && o.status === "open" ? `<div class=\"form-actions\"><button class=\"btn primary ready-btn\" data-id=\"${o.id}\">Ready for delivery</button></div>` : ""}${delivery && o.status === "ready" ? `<div class=\"form-actions\"><button class=\"btn dark deliver-btn\" data-id=\"${o.id}\">Mark delivered</button></div>` : ""}</article>`;
    }

    async function saveOrder(e) {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const work = [...document.querySelectorAll('input[name="work"]:checked')].map((x) => x.value);
      if (!work.length) return alert("Select at least one work type.");
      const amount = Number(f.get("amount"));
      const advance = Number(f.get("advance"));
      if (advance > amount) return alert("Advance cannot be higher than the total amount.");
      let design_path = null;
      const file = f.get("design");
      if (file?.size) {
        const path = `${currentUser.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await db.storage.from("designs").upload(path, file);
        if (up.error) return alert(up.error.message);
        design_path = path;
      }
      const { data: o, error } = await db.from("orders").insert({
        client_name: f.get("client_name"),
        contact_number: f.get("contact_number"),
        email: f.get("email") || null,
        work,
        amount,
        advance,
        design_path,
        created_by: currentUser.id,
      }).select().single();
      if (error) return alert(error.message);
      e.currentTarget.reset();
      await refreshDashboard();
      showPage("dashboard");
      whatsapp(o.contact_number, `Dear Customer, your order ${o.order_code} is placed. ${money(advance)} advance paid. You will get a message after the work is ready. Thank you.`);
    }

    async function searchOrders(e) {
      if (e) e.preventDefault();
      const term = $("#search-term")?.value.trim();
      if (!term) return;
      const { data, error } = await db.from("orders").select("*").or(`order_code.ilike.%${term}%,contact_number.ilike.%${term}%`).order("created_at", { ascending: false });
      if (error) return alert(error.message);
      $("#search-results").innerHTML = data?.length ? data.map((o) => orderHtml(o, true)).join("") : "No order found.";
      document.querySelectorAll(".ready-btn").forEach((b) => b.addEventListener("click", () => setReady(b.dataset.id)));
      document.querySelectorAll(".deliver-btn").forEach((b) => b.addEventListener("click", () => setDelivered(b.dataset.id)));
    }

    async function setReady(id) {
      const { data: o, error } = await db.from("orders").update({ status: "ready" }).eq("id", id).select().single();
      if (error) return alert(error.message);
      whatsapp(o.contact_number, `Dear Customer, your order ${o.order_code} is ready for delivery. Your balance ${money(Number(o.amount) - Number(o.advance))} has to be paid. Thank you.`);
      $("#search-form")?.requestSubmit();
      await refreshDashboard();
    }

    async function setDelivered(id) {
      const { error } = await db.from("orders").update({ status: "delivered" }).eq("id", id);
      if (error) return alert(error.message);
      $("#search-form")?.requestSubmit();
      await refreshDashboard();
    }

    function renderCustomers(orders) {
      const q = $("#customer-search")?.value.trim().toLowerCase() || "";
      const list = orders.filter((o) => !q || `${o.client_name} ${o.order_code} ${o.contact_number}`.toLowerCase().includes(q));
      $("#customer-list").innerHTML = list.length
        ? `<table class=\"customer-table\"><thead><tr><th>Order ID</th><th>Client name</th><th>Contact</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>${list
            .map((o) => `<tr><td>${safe(o.order_code)}</td><td>${safe(o.client_name)}</td><td>${safe(o.contact_number)}</td><td>${money(o.amount)}</td><td>${money(Number(o.amount) - Number(o.advance))}</td><td class=\"status ${o.status}\">${safe(o.status)}</td></tr>`)
            .join("")}</tbody></table>`
        : "No customer records found.";
    }

    function exportCustomers() {
      const text = [
        "Order ID,Client Name,Contact,Amount,Advance,Balance,Status",
        ...cachedOrders.map((o) =>
          [o.order_code, o.client_name, o.contact_number, o.amount, o.advance, Number(o.amount) - Number(o.advance), o.status]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      link.download = "printflow-customers.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function renderReports() {
      const from = $("#report-from")?.value ? new Date($("#report-from").value) : null;
      const to = $("#report-to")?.value ? new Date(`${$("#report-to").value}T23:59:59`) : null;
      const rows = cachedOrders.filter((o) => (!from || new Date(o.created_at) >= from) && (!to || new Date(o.created_at) <= to));
      if ($("#report-orders")) $("#report-orders").textContent = rows.length;
      if ($("#report-sales")) $("#report-sales").textContent = money(rows.reduce((n, o) => n + Number(o.amount), 0));
      if ($("#report-balance")) $("#report-balance").textContent = money(rows.reduce((n, o) => n + Number(o.amount) - Number(o.advance), 0));
    }

    async function loadMaterials() {
      const { data, error } = await db.from("vendor_materials").select("*").order("vendor_name");
      if (error) return;
      materialRows = data || [];
      $("#vendor-list").innerHTML = materialRows.length
        ? materialRows
            .map((x) => `<div class=\"vendor-row\"><span><b>${safe(x.vendor_name)}</b><br>${safe(x.material)}</span><b>${money(x.rate)}</b></div>`)
            .join("")
        : "No vendors added.";
      const vendors = [...new Set(materialRows.map((x) => x.vendor_name))];
      $("#purchase-vendor").innerHTML = '<option value="">Choose vendor</option>' + vendors.map((v) => `<option>${safe(v)}</option>`).join("");
    }

    async function saveVendor(e) {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const { error } = await db.from("vendor_materials").upsert({
        vendor_name: f.get("vendor_name"),
        material: f.get("material"),
        rate: f.get("rate"),
      }, { onConflict: "vendor_name,material" });
      if (error) return alert(error.message);
      e.currentTarget.reset();
      await loadMaterials();
    }

    function updateMaterialOptions() {
      const vendor = $("#purchase-vendor")?.value;
      const items = materialRows.filter((x) => x.vendor_name === vendor);
      const purchaseMaterial = $("#purchase-material");
      if (purchaseMaterial) {
        purchaseMaterial.disabled = !vendor;
        purchaseMaterial.innerHTML = '<option value="">Choose material</option>' + items.map((x) => `<option value="${x.id}">${safe(x.material)} (${money(x.rate)})</option>`).join("");
      }
      updatePurchaseAmount();
    }

    function updatePurchaseAmount() {
      const materialId = $("#purchase-material")?.value;
      const item = materialRows.find((x) => String(x.id) === materialId);
      const qty = Number(document.querySelector('[name="qty"]')?.value || 0);
      if ($("#purchase-amount")) $("#purchase-amount").value = money(item ? Number(item.rate) * qty : 0);
    }

    async function savePurchase(e) {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const item = materialRows.find((x) => String(x.id) === f.get("material_id"));
      if (!item) return;
      const qty = Number(f.get("qty"));
      const { error } = await db.from("vendor_purchases").insert({
        order_id: f.get("order_id"),
        vendor_material_id: item.id,
        qty,
        sft: f.get("sft") || null,
        amount: Number(item.rate) * qty,
        created_by: currentUser.id,
      });
      if (error) return alert(error.message);
      alert("Vendor order saved.");
      e.currentTarget.reset();
      updateMaterialOptions();
    }

    const init = async () => {
      $("#loading")?.classList.add("hidden");
      if ($("#year")) $("#year").textContent = new Date().getFullYear();
      bindEvents();
      if (!configured) $("#setup-warning")?.classList.remove("hidden");
      if (!db) return;
      const { data } = await db.auth.getSession();
      if (data?.session) await enterApp(data.session.user);
    };

    init();
  }, []);

  return (
    <div className="app-root">
      <div id="loading" className="loading-screen">Loading…</div>
      <div id="setup-warning" className="hidden warning-box">
        <strong>Supabase is not configured.</strong> Edit this page and add your Supabase URL and anon key.
      </div>

      <section id="public-site" className="public-site">
        <header className="hero-header">
          <div>
            <h1>Printflow</h1>
            <p>Simple order tracking for print staff.</p>
          </div>
          <div>
            <button id="staff-login" className="btn primary">Staff login</button>
          </div>
        </header>

        <div className="public-nav">
          <button id="public-menu" className="btn secondary">Menu</button>
          <nav>
            <button data-page="dashboard" className="nav-link active">Dashboard</button>
            <button data-page="delivery" className="nav-link">Delivery</button>
            <button data-page="customers" className="nav-link">Customers</button>
            <button data-page="reports" className="nav-link">Reports</button>
            <button data-page="materials" className="nav-link">Materials</button>
          </nav>
        </div>

        <div className="public-copy">
          <p>Use the staff login button to access the admin dashboard and manage print orders.</p>
        </div>

        <footer className="public-footer">
          <span>© <span id="year" /></span>
        </footer>
      </section>

      <section id="login-screen" className="hidden center-panel">
        <div className="auth-card">
          <h2>Staff sign in</h2>
          <form id="login-form" className="auth-form">
            <label>Email</label>
            <input id="login-email" name="email" type="email" required placeholder="you@example.com" />
            <button type="submit" className="btn primary">Send login link</button>
          </form>

          <form id="otp-form" className="auth-form hidden">
            <label>Enter OTP</label>
            <input id="otp" name="otp" type="text" inputMode="numeric" placeholder="8-digit code" required />
            <button type="submit" className="btn primary">Verify</button>
            <button type="button" id="change-email" className="btn secondary">Use another email</button>
          </form>

          <p id="auth-note" className="auth-note"></p>
          <button id="back-public" className="btn secondary">Back to public page</button>
        </div>
      </section>

      <section id="app" className="hidden app-shell">
        <div className="app-topbar">
          <div>
            <button id="menu-toggle" className="btn secondary">Menu</button>
            <strong>Signed in as</strong> <span id="user-email" />
          </div>
          <div>
            <button id="settings-logout" className="btn danger">Logout</button>
          </div>
        </div>

        <div className="app-nav-panel">
          <button data-page="dashboard" className="nav-link active">Dashboard</button>
          <button data-page="delivery" className="nav-link">Delivery</button>
          <button data-page="customers" className="nav-link">Customers</button>
          <button data-page="reports" className="nav-link">Reports</button>
          <button data-page="materials" className="nav-link">Materials</button>
        </div>

        <main className="app-main">
          <section id="dashboard" className="page active">
            <h2>Dashboard</h2>
            <div className="stats-grid">
              <div className="stat-card"><strong id="today-count">0</strong><span>Today</span></div>
              <div className="stat-card"><strong id="open-count">0</strong><span>Open</span></div>
              <div className="stat-card"><strong id="ready-count">0</strong><span>Ready</span></div>
              <div className="stat-card"><strong id="delivered-count">0</strong><span>Delivered</span></div>
            </div>
            <div className="stats-grid">
              <div className="stat-card"><strong id="balance-total">₹0</strong><span>Balance</span></div>
              <div className="stat-card"><strong id="sales-total">₹0</strong><span>Sales</span></div>
            </div>
            <div className="dashboard-section">
              <h3>Recent orders</h3>
              <div id="recent-orders" className="order-list">No orders yet. Add your first printing project.</div>
            </div>
            <div className="dashboard-section">
              <h3>Create order</h3>
              <form id="order-form" className="panel-form">
                <label>Client name<input name="client_name" required /></label>
                <label>Contact number<input name="contact_number" required /></label>
                <label>Email<input name="email" type="email" /></label>
                <label>Amount<input name="amount" type="number" min="0" required /></label>
                <label>Advance<input name="advance" type="number" min="0" required /></label>
                <fieldset>
                  <legend>Work</legend>
                  <label><input type="checkbox" name="work" value="Print" /> Print</label>
                  <label><input type="checkbox" name="work" value="Design" /> Design</label>
                  <label><input type="checkbox" name="work" value="Bind" /> Bind</label>
                </fieldset>
                <label>Design file<input name="design" type="file" /></label>
                <button type="submit" className="btn primary">Save order</button>
              </form>
            </div>
            <div className="dashboard-section">
              <h3>Order activity</h3>
              <div id="order-chart" className="chart-row"></div>
            </div>
          </section>

          <section id="delivery" className="page">
            <h2>Delivery</h2>
            <form id="search-form" className="panel-form">
              <label>Search order code or phone<input id="search-term" name="search" /></label>
              <button type="submit" className="btn primary">Search</button>
            </form>
            <div id="search-results" className="order-list">Search results appear here.</div>
          </section>

          <section id="customers" className="page">
            <h2>Customers</h2>
            <div className="panel-row">
              <label>Search<input id="customer-search" type="search" placeholder="Client name, order or contact" /></label>
              <button id="export-customers" className="btn secondary">Export CSV</button>
            </div>
            <div id="customer-list" className="order-list">No customer records found.</div>
          </section>

          <section id="reports" className="page">
            <h2>Reports</h2>
            <div className="panel-row">
              <label>From<input id="report-from" type="date" /></label>
              <label>To<input id="report-to" type="date" /></label>
              <button id="report-filter" className="btn primary">Filter</button>
            </div>
            <div className="stats-grid">
              <div className="stat-card"><strong id="report-orders">0</strong><span>Orders</span></div>
              <div className="stat-card"><strong id="report-sales">₹0</strong><span>Sales</span></div>
              <div className="stat-card"><strong id="report-balance">₹0</strong><span>Balance</span></div>
            </div>
          </section>

          <section id="materials" className="page">
            <h2>Materials</h2>
            <div id="vendor-list" className="order-list">No vendors added.</div>
            <form id="vendor-form" className="panel-form admin-only">
              <h3>Add vendor material</h3>
              <label>Vendor name<input name="vendor_name" required /></label>
              <label>Material<input name="material" required /></label>
              <label>Rate<input name="rate" type="number" step="0.01" required /></label>
              <button type="submit" className="btn primary">Save vendor</button>
            </form>
            <form id="purchase-form" className="panel-form admin-only">
              <h3>Purchase material</h3>
              <label>Order ID<input name="order_id" /></label>
              <label>Vendor<select id="purchase-vendor" /></label>
              <label>Material<select id="purchase-material" name="material_id" disabled /></label>
              <label>Quantity<input name="qty" type="number" min="1" defaultValue="1" /></label>
              <label>Square feet<input name="sft" /></label>
              <label>Amount<input id="purchase-amount" readOnly /></label>
              <button type="submit" className="btn primary">Save purchase</button>
            </form>
          </section>
        </main>
      </section>
    </div>
  );
}
