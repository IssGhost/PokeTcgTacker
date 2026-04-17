diff --git a/server.js b/server.js
index d1e75bddb5a51e2d2b4691746d6d6fdf633899f6..808d7e10620a95931c420f6ba849f5c90f94fc8f 100644
--- a/server.js
+++ b/server.js
@@ -1,45 +1,49 @@
 require("dotenv").config();
 
 const express = require("express");
 const cookieParser = require("cookie-parser");
 const helmet = require("helmet");
 const bcrypt = require("bcryptjs");
 const Stripe = require("stripe");
+const http = require("http");
+const https = require("https");
 const path = require("path");
 
 const { createDb } = require("./db");
 const { signAuthCookie, requireAuth } = require("./auth");
 
 const app = express();
 const db = createDb(path.join(__dirname, "app.db"));
 
 const stripeKey = process.env.STRIPE_SECRET_KEY || "";
 const stripe = stripeKey ? new Stripe(stripeKey) : null;
 
 const PORT = process.env.PORT || 3000;
 const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
+const AUTO_SCAN_ENABLED = String(process.env.AUTO_SCAN_ENABLED || "true").toLowerCase() !== "false";
+const AUTO_SCAN_INTERVAL_MS = Math.max(Number(process.env.AUTO_SCAN_INTERVAL_MS || 180000), 30000);
 
 const PLANS = {
   free: {
     id: "free",
     label: "Free",
     monthly: "$0",
     alertsQuota: 5,
     features: ["Up to 5 alert targets", "Manual config only", "Basic dashboard"]
   },
   basic: {
     id: "basic",
     label: "Basic",
     monthly: "$9/mo",
     alertsQuota: 50,
     stripePriceEnv: "STRIPE_PRICE_BASIC_MONTHLY",
     features: ["Up to 50 alert targets", "Discord alert channels", "Priority checks"]
   },
   pro: {
     id: "pro",
     label: "Pro",
     monthly: "$19/mo",
     alertsQuota: 250,
     stripePriceEnv: "STRIPE_PRICE_PRO_MONTHLY",
     features: ["Up to 250 alert targets", "Multiple channels", "Advanced retailer groups"]
   }
@@ -125,50 +129,246 @@ function ensureOwnerSeeded() {
           subscription_status = 'active',
           alerts_quota = 999999
       WHERE email = ?
     `).run(email);
     return;
   }
 
   const hash = bcrypt.hashSync(password, 10);
   db.prepare(`
     INSERT INTO users (email, password_hash, role, subscription_tier, subscription_status, alerts_quota)
     VALUES (?, ?, 'owner', 'pro', 'active', 999999)
   `).run(email, hash);
 }
 
 function planFromPriceId(priceId) {
   for (const plan of Object.values(PLANS)) {
     if (plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId) return plan;
   }
   return null;
 }
 
 function quotaForPlan(planId) {
   return PLANS[planId]?.alertsQuota ?? PLANS.free.alertsQuota;
 }
 
+function escapeHtml(value) {
+  return String(value ?? "")
+    .replaceAll("&", "&amp;")
+    .replaceAll("<", "&lt;")
+    .replaceAll(">", "&gt;")
+    .replaceAll('"', "&quot;")
+    .replaceAll("'", "&#39;");
+}
+
+function postJson(url, payload) {
+  return new Promise((resolve, reject) => {
+    const body = JSON.stringify(payload);
+    const req = https.request(url, {
+      method: "POST",
+      headers: {
+        "Content-Type": "application/json",
+        "Content-Length": Buffer.byteLength(body)
+      }
+    }, (res) => {
+      let responseBody = "";
+      res.on("data", chunk => {
+        responseBody += chunk;
+      });
+      res.on("end", () => {
+        if (res.statusCode >= 200 && res.statusCode < 300) {
+          resolve({ statusCode: res.statusCode, body: responseBody });
+          return;
+        }
+        reject(new Error(`Webhook POST failed with ${res.statusCode}: ${responseBody}`));
+      });
+    });
+
+    req.on("error", reject);
+    req.write(body);
+    req.end();
+  });
+}
+
+async function sendDiscordAlert(target, options = {}) {
+  if (target.channel_type !== "discord") {
+    throw new Error("Only Discord webhook targets are supported for test sends.");
+  }
+
+  const productName = options.productName || target.name;
+  const retailer = options.retailer || target.retailer;
+  const timeAgo = options.timeAgo || "3 hours ago";
+  const headline = options.headline || `This product was dropped at ${retailer} ${timeAgo}. Keep up to date with us.`;
+
+  const content = [
+    headline,
+    `Product: ${productName}`,
+    `Link: ${target.product_url}`
+  ].join("\n");
+
+  return postJson(target.channel_value, { content });
+}
+
+function getDiscordWebhookForTarget(target) {
+  const targetWebhook = String(target.channel_value || "").trim();
+  if (targetWebhook) return targetWebhook;
+  return String(target.discord_webhook || "").trim();
+}
+
+function getRequestClient(url) {
+  return url.startsWith("https:") ? https : http;
+}
+
+function fetchText(url, redirectCount = 0) {
+  return new Promise((resolve, reject) => {
+    const client = getRequestClient(url);
+    const req = client.get(url, {
+      headers: {
+        "User-Agent": "PokemonAlertsBot/1.0 (+https://railway.app)"
+      }
+    }, (res) => {
+      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
+        const nextUrl = new URL(res.headers.location, url).toString();
+        resolve(fetchText(nextUrl, redirectCount + 1));
+        return;
+      }
+
+      let body = "";
+      res.on("data", (chunk) => {
+        body += chunk;
+      });
+      res.on("end", () => {
+        if (res.statusCode >= 200 && res.statusCode < 300) {
+          resolve(body);
+          return;
+        }
+        reject(new Error(`Product page fetch failed with ${res.statusCode}`));
+      });
+    });
+
+    req.on("error", reject);
+    req.setTimeout(10000, () => {
+      req.destroy(new Error("Product page fetch timed out"));
+    });
+  });
+}
+
+function detectAvailability(html) {
+  const text = String(html || "").toLowerCase();
+  const inStockKeywords = [
+    "in stock",
+    "add to cart",
+    "available now",
+    "pickup available",
+    "ship it"
+  ];
+  const outOfStockKeywords = [
+    "out of stock",
+    "sold out",
+    "currently unavailable",
+    "not available"
+  ];
+
+  const hasInStock = inStockKeywords.some((keyword) => text.includes(keyword));
+  const hasOutOfStock = outOfStockKeywords.some((keyword) => text.includes(keyword));
+
+  if (hasInStock && !hasOutOfStock) return "in_stock";
+  if (hasOutOfStock && !hasInStock) return "out_of_stock";
+  return "unknown";
+}
+
+async function scanAlertTarget(target) {
+  try {
+    const html = await fetchText(target.product_url);
+    return {
+      status: detectAvailability(html),
+      error: null
+    };
+  } catch (err) {
+    return {
+      status: "unknown",
+      error: err
+    };
+  }
+}
+
+function formatTimeAgo(date) {
+  const diffMs = Date.now() - date.getTime();
+  const totalMinutes = Math.max(Math.round(diffMs / 60000), 0);
+  if (totalMinutes < 60) return `${totalMinutes} minutes ago`;
+  const totalHours = Math.round(totalMinutes / 60);
+  if (totalHours < 24) return `${totalHours} hours ago`;
+  const totalDays = Math.round(totalHours / 24);
+  return `${totalDays} days ago`;
+}
+
+async function runAutomatedScan(userId = null) {
+  const targets = db.prepare(`
+    SELECT t.*, u.discord_webhook
+    FROM alert_targets t
+    JOIN users u ON u.id = t.user_id
+    WHERE t.active = 1 AND t.channel_type = 'discord'
+      AND (? IS NULL OR t.user_id = ?)
+    ORDER BY t.id ASC
+  `).all(userId, userId);
+
+  for (const target of targets) {
+    const webhook = getDiscordWebhookForTarget(target);
+    const startedAt = new Date().toISOString();
+    const result = await scanAlertTarget(target);
+
+    db.prepare(`
+      UPDATE alert_targets
+      SET last_scan_status = ?, last_scan_at = ?
+      WHERE id = ?
+    `).run(result.status, startedAt, target.id);
+
+    if (result.error) {
+      console.error(`Scan failed for target ${target.id}:`, result.error.message);
+      continue;
+    }
+
+    if (!webhook) continue;
+    if (result.status !== "in_stock") continue;
+    if (target.last_scan_status === "in_stock") continue;
+
+    const syntheticTarget = { ...target, channel_value: webhook };
+    await sendDiscordAlert(syntheticTarget, { timeAgo: formatTimeAgo(new Date(startedAt)) });
+
+    db.prepare(`
+      UPDATE alert_targets
+      SET last_alerted_at = ?
+      WHERE id = ?
+    `).run(startedAt, target.id);
+
+    db.prepare(`
+      INSERT INTO alert_events (alert_target_id, user_id, event_type, event_message)
+      VALUES (?, ?, 'in_stock', ?)
+    `).run(target.id, target.user_id, `${target.name} in stock at ${target.retailer}`);
+  }
+}
+
 ensureOwnerSeeded();
 
 app.post("/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
   if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
     return res.status(200).send("Stripe not configured");
   }
 
   let event;
   try {
     event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
   } catch (err) {
     return res.status(400).send(`Webhook Error: ${err.message}`);
   }
 
   try {
     if (event.type === "checkout.session.completed") {
       const session = event.data.object;
       const userId = Number(session.metadata?.userId);
       const planId = session.metadata?.planId;
       const subscriptionId = session.subscription;
       const customerId = session.customer;
 
       if (userId && planId) {
         db.prepare(`
           UPDATE users
@@ -305,132 +505,204 @@ app.get("/login", (req, res) => {
 
 app.post("/login", async (req, res) => {
   const email = String(req.body.email || "").trim().toLowerCase();
   const password = String(req.body.password || "");
   const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
   if (!user) {
     return res.status(401).send(renderPage("Login", `<div class="card"><p class="danger">Invalid login.</p><a href="/login"><button>Try again</button></a></div>`));
   }
   const ok = await bcrypt.compare(password, user.password_hash);
   if (!ok) {
     return res.status(401).send(renderPage("Login", `<div class="card"><p class="danger">Invalid login.</p><a href="/login"><button>Try again</button></a></div>`));
   }
   res.cookie("auth_token", signAuthCookie(user), { httpOnly: true, sameSite: "lax", secure: false });
   res.redirect("/dashboard");
 });
 
 app.post("/logout", (req, res) => {
   res.clearCookie("auth_token");
   res.redirect("/");
 });
 
 app.get("/dashboard", requireAuth, (req, res) => {
   const user = ownerOverride(getUserById(req.auth.sub));
   const targets = db.prepare("SELECT * FROM alert_targets WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
   const remaining = Math.max(user.alerts_quota - targets.length, 0);
+  const flash = String(req.query.flash || "").trim();
+  const message = String(req.query.message || "").trim();
+
+  const flashHtml = flash && message ? `
+    <div class="card">
+      <p class="${flash === "success" ? "success" : "danger"}">${escapeHtml(message)}</p>
+    </div>
+  ` : "";
 
   const rows = targets.length ? targets.map(t => `
     <tr>
       <td>${t.name}</td>
       <td>${t.retailer}</td>
       <td><a href="${t.product_url}" target="_blank" rel="noopener noreferrer">Open</a></td>
       <td>${t.channel_type}</td>
       <td>${t.active ? "Active" : "Paused"}</td>
+      <td>${t.last_scan_status || "unknown"}</td>
       <td>
+        <form method="post" action="/alerts/${t.id}/test" style="margin-bottom:8px;">
+          <button>Send Test Alert</button>
+        </form>
         <form method="post" action="/alerts/${t.id}/delete" onsubmit="return confirm('Delete this alert target?')">
           <button>Delete</button>
         </form>
       </td>
     </tr>`).join("")
-  : `<tr><td colspan="6" class="muted">No alert targets yet.</td></tr>`;
+  : `<tr><td colspan="7" class="muted">No alert targets yet.</td></tr>`;
 
   const body = `
+    ${flashHtml}
     <div class="grid">
       <div class="card">
         <h2>Account</h2>
         <p><strong>${user.email}</strong></p>
         <p>Role: <span class="pill">${user.role}</span></p>
         <p>Plan: <span class="pill">${user.subscription_tier}</span></p>
         <p>Status: <span class="pill">${user.subscription_status}</span></p>
         <p>Quota remaining: ${remaining}</p>
         <a href="/pricing"><button>Change plan</button></a>
       </div>
+      <div class="card">
+        <h2>Discord defaults</h2>
+        <p class="muted">Set a default webhook once. New and existing Discord targets can use this automatically.</p>
+        <form method="post" action="/settings/discord-webhook">
+          <label>Default Discord webhook</label>
+          <input name="discord_webhook" type="url" placeholder="https://discord.com/api/webhooks/..." value="${escapeHtml(user.discord_webhook || "")}" />
+          <div style="margin-top:16px;"><button>Save default webhook</button></div>
+        </form>
+        <form method="post" action="/alerts/scan-now" style="margin-top:12px;">
+          <button>Run automated scan now</button>
+        </form>
+      </div>
       <div class="card">
         <h2>Add alert target</h2>
         <form method="post" action="/alerts">
           <label>Name</label><input name="name" required placeholder="Journey Together ETB" />
           <label style="margin-top:12px; display:block;">Retailer</label><input name="retailer" required placeholder="Target" />
           <label style="margin-top:12px; display:block;">Product URL</label><input name="product_url" required type="url" placeholder="https://www.target.com/..." />
           <label style="margin-top:12px; display:block;">Channel type</label>
           <select name="channel_type">
             <option value="discord">Discord webhook</option>
             <option value="email">Email placeholder</option>
           </select>
-          <label style="margin-top:12px; display:block;">Channel value</label><input name="channel_value" required placeholder="Discord webhook URL or email address" />
+          <label style="margin-top:12px; display:block;">Channel value</label><input name="channel_value" placeholder="Optional for Discord if default webhook is set" />
           <div style="margin-top:16px;"><button>Add target</button></div>
         </form>
       </div>
     </div>
 
     <div class="card">
       <h2>Your alert targets</h2>
       <table>
-        <thead><tr><th>Name</th><th>Retailer</th><th>URL</th><th>Channel</th><th>Status</th><th>Action</th></tr></thead>
+        <thead><tr><th>Name</th><th>Retailer</th><th>URL</th><th>Channel</th><th>Status</th><th>Last scan</th><th>Action</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
     </div>
   `;
   res.send(renderPage("Dashboard", body, user));
 });
 
 app.post("/alerts", requireAuth, (req, res) => {
   const user = ownerOverride(getUserById(req.auth.sub));
   const count = db.prepare("SELECT COUNT(*) AS c FROM alert_targets WHERE user_id = ?").get(user.id).c;
   if (count >= user.alerts_quota) {
     return res.status(400).send(renderPage("Quota reached", `<div class="card"><p class="danger">You have reached your alert quota for the ${user.subscription_tier} plan.</p><a href="/pricing"><button>Upgrade plan</button></a></div>`, user));
   }
 
   const payload = {
     name: String(req.body.name || "").trim(),
     retailer: String(req.body.retailer || "").trim(),
     product_url: String(req.body.product_url || "").trim(),
     channel_type: String(req.body.channel_type || "discord").trim(),
     channel_value: String(req.body.channel_value || "").trim()
   };
 
-  if (!payload.name || !payload.retailer || !payload.product_url || !payload.channel_value) {
+  const fallbackWebhook = String(user.discord_webhook || "").trim();
+  if (!payload.name || !payload.retailer || !payload.product_url) {
     return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Fill in every field.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
   }
+  if (payload.channel_type === "discord" && !payload.channel_value && !fallbackWebhook) {
+    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Add a channel value or set a default Discord webhook first.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
+  }
+  const finalChannelValue = payload.channel_type === "discord" && !payload.channel_value
+    ? fallbackWebhook
+    : payload.channel_value;
 
   db.prepare(`
     INSERT INTO alert_targets (user_id, name, retailer, product_url, channel_type, channel_value, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
-  `).run(user.id, payload.name, payload.retailer, payload.product_url, payload.channel_type, payload.channel_value);
+  `).run(user.id, payload.name, payload.retailer, payload.product_url, payload.channel_type, finalChannelValue);
 
   res.redirect("/dashboard");
 });
 
+app.post("/settings/discord-webhook", requireAuth, (req, res) => {
+  const user = ownerOverride(getUserById(req.auth.sub));
+  const webhook = String(req.body.discord_webhook || "").trim();
+  db.prepare("UPDATE users SET discord_webhook = ? WHERE id = ?").run(webhook || null, user.id);
+  res.redirect("/dashboard?flash=success&message=Default%20Discord%20webhook%20saved");
+});
+
+app.post("/alerts/scan-now", requireAuth, async (req, res) => {
+  const user = ownerOverride(getUserById(req.auth.sub));
+  try {
+    await runAutomatedScan(user.id);
+    return res.redirect("/dashboard?flash=success&message=Automated%20scan%20completed");
+  } catch (err) {
+    console.error("Manual scan failed:", err);
+    return res.redirect("/dashboard?flash=error&message=Automated%20scan%20failed");
+  }
+});
+
+app.post("/alerts/:id/test", requireAuth, async (req, res) => {
+  const user = ownerOverride(getUserById(req.auth.sub));
+  const alertId = Number(req.params.id);
+  const target = db.prepare("SELECT * FROM alert_targets WHERE id = ? AND user_id = ?").get(alertId, user.id);
+
+  if (!target) {
+    return res.redirect("/dashboard?flash=error&message=Alert%20target%20not%20found");
+  }
+
+  try {
+    const webhook = getDiscordWebhookForTarget({ ...target, discord_webhook: user.discord_webhook });
+    if (!webhook) {
+      return res.redirect("/dashboard?flash=error&message=Missing%20Discord%20webhook%20for%20this%20target");
+    }
+    await sendDiscordAlert({ ...target, channel_value: webhook }, { timeAgo: "3 hours ago" });
+    return res.redirect("/dashboard?flash=success&message=Test%20alert%20sent%20to%20Discord");
+  } catch (err) {
+    console.error("Test alert send failed:", err);
+    return res.redirect("/dashboard?flash=error&message=Discord%20test%20send%20failed");
+  }
+});
+
 app.post("/alerts/:id/delete", requireAuth, (req, res) => {
   const user = ownerOverride(getUserById(req.auth.sub));
   const alertId = Number(req.params.id);
   db.prepare("DELETE FROM alert_targets WHERE id = ? AND user_id = ?").run(alertId, user.id);
   res.redirect("/dashboard");
 });
 
 app.post("/create-checkout-session", requireAuth, async (req, res) => {
   const user = ownerOverride(getUserById(req.auth.sub));
   const planId = String(req.body.planId || "");
   const plan = PLANS[planId];
   if (!plan || !plan.stripePriceEnv) {
     return res.status(400).send("Unknown paid plan");
   }
   if (!stripe) {
     return res.status(500).send("Stripe is not configured");
   }
   const priceId = process.env[plan.stripePriceEnv];
   if (!priceId) {
     return res.status(500).send(`Missing ${plan.stripePriceEnv}`);
   }
 
   let customerId = user.stripe_customer_id;
   if (!customerId) {
     const customer = await stripe.customers.create({
@@ -438,28 +710,41 @@ app.post("/create-checkout-session", requireAuth, async (req, res) => {
       metadata: { userId: String(user.id) }
     });
     customerId = customer.id;
     db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
   }
 
   const session = await stripe.checkout.sessions.create({
     mode: "subscription",
     customer: customerId,
     line_items: [{ price: priceId, quantity: 1 }],
     success_url: `${APP_URL}/dashboard?checkout=success`,
     cancel_url: `${APP_URL}/pricing?checkout=canceled`,
     metadata: {
       userId: String(user.id),
       planId: plan.id
     }
   });
 
   res.redirect(303, session.url);
 });
 
 app.get("/health", (_req, res) => {
   res.json({ ok: true });
 });
 
+if (AUTO_SCAN_ENABLED) {
+  setInterval(() => {
+    runAutomatedScan().catch((err) => {
+      console.error("Automated scan failed:", err);
+    });
+  }, AUTO_SCAN_INTERVAL_MS);
+}
+
 app.listen(PORT, () => {
   console.log(`Pokemon Alerts SaaS running on ${APP_URL}`);
+  if (AUTO_SCAN_ENABLED) {
+    console.log(`Automated scans enabled every ${AUTO_SCAN_INTERVAL_MS}ms`);
+  } else {
+    console.log("Automated scans disabled");
+  }
 });
