require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const https = require("https");
const path = require("path");

const { createDb } = require("./db");
const { signAuthCookie, requireAuth } = require("./auth");

const app = express();
const db = createDb(path.join(__dirname, "app.db"));

const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

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
};

function renderPage(title, body, user = null) {
  const nav = `
    <nav class="nav">
      <a href="/">Home</a>
      ${user ? `<a href="/dashboard">Dashboard</a><a href="/pricing">Pricing</a><form method="post" action="/logout" style="display:inline"><button class="linkbutton">Logout</button></form>` : `<a href="/pricing">Pricing</a><a href="/login">Login</a><a href="/register">Register</a>`}
    </nav>
  `;
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #0b1020; color: #eef2ff; }
      .wrap { max-width: 1080px; margin: 0 auto; padding: 24px; }
      .nav { display:flex; gap:16px; align-items:center; padding:16px 24px; background:#111933; border-bottom:1px solid #22305e; }
      .nav a, .linkbutton { color:#cfe1ff; text-decoration:none; background:none; border:none; cursor:pointer; font:inherit; padding:0; }
      .hero, .card { background:#111933; border:1px solid #22305e; border-radius:16px; padding:24px; margin-top:20px; }
      .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
      input, select, textarea { width:100%; padding:12px; border-radius:10px; border:1px solid #34467d; background:#0a1430; color:#eef2ff; }
      button { background:#4f7cff; color:white; border:none; padding:12px 16px; border-radius:10px; cursor:pointer; font-weight:600; }
      .muted { color:#b4c2e5; }
      .success { color:#9ff7b4; }
      .danger { color:#ffb7b7; }
      table { width:100%; border-collapse:collapse; margin-top:16px; }
      th, td { text-align:left; padding:10px; border-bottom:1px solid #22305e; }
      ul { padding-left:18px; }
      .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:#22305e; font-size:12px; }
    </style>
  </head>
  <body>
    ${nav}
    <div class="wrap">
      ${body}
    </div>
  </body>
  </html>`;
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function currentUser(req) {
  if (!req.cookies.auth_token) return null;
  try {
    const decoded = require("jsonwebtoken").verify(req.cookies.auth_token, process.env.JWT_SECRET);
    return getUserById(decoded.sub) || null;
  } catch {
    return null;
  }
}

function ownerOverride(user) {
  if (!user) return user;
  if (user.role === "owner") {
    return {
      ...user,
      subscription_tier: "pro",
      subscription_status: "active",
      alerts_quota: 999999
    };
  }
  return user;
}

function ensureOwnerSeeded() {
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || "";
  if (!email || !password) return;
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET role = 'owner',
          subscription_tier = 'pro',
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let responseBody = "";
      res.on("data", chunk => {
        responseBody += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: responseBody });
          return;
        }
        reject(new Error(`Webhook POST failed with ${res.statusCode}: ${responseBody}`));
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendDiscordAlert(target, options = {}) {
  if (target.channel_type !== "discord") {
    throw new Error("Only Discord webhook targets are supported for test sends.");
  }

  const productName = options.productName || target.name;
  const retailer = options.retailer || target.retailer;
  const timeAgo = options.timeAgo || "3 hours ago";
  const headline = options.headline || `This product was dropped at ${retailer} ${timeAgo}. Keep up to date with us.`;

  const content = [
    headline,
    `Product: ${productName}`,
    `Link: ${target.product_url}`
  ].join("\n");

  return postJson(target.channel_value, { content });
}

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
          SET stripe_customer_id = ?,
              stripe_subscription_id = ?,
              subscription_tier = ?,
              subscription_status = 'active',
              alerts_quota = ?
          WHERE id = ?
        `).run(customerId || null, subscriptionId || null, planId, quotaForPlan(planId), userId);
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const status = sub.status || "canceled";
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const plan = planFromPriceId(priceId);
      db.prepare(`
        UPDATE users
        SET subscription_status = ?,
            subscription_tier = ?,
            alerts_quota = ?
        WHERE stripe_subscription_id = ?
      `).run(
        status,
        status === "active" && plan ? plan.id : "free",
        status === "active" && plan ? quotaForPlan(plan.id) : quotaForPlan("free"),
        sub.id
      );
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }

  res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false }));

app.get("/", (req, res) => {
  const user = ownerOverride(currentUser(req));
  const body = `
    <section class="hero">
      <span class="pill">Pokemon TCG Alerts SaaS Starter</span>
      <h1>Sell paid alert subscriptions without giving yourself limits.</h1>
      <p class="muted">This starter includes login, owner seeding, free/basic/pro plans, Stripe Checkout, webhook syncing, and a simple alert-target dashboard.</p>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:18px;">
        <a href="/pricing"><button>See pricing</button></a>
        ${user ? `<a href="/dashboard"><button>Open dashboard</button></a>` : `<a href="/register"><button>Create account</button></a>`}
      </div>
    </section>
    <section class="grid">
      <div class="card"><h3>Owner access</h3><p class="muted">Your owner account is seeded automatically from <code>OWNER_EMAIL</code> and <code>OWNER_PASSWORD</code> and always has active pro access.</p></div>
      <div class="card"><h3>Monetization</h3><p class="muted">Paid users upgrade through Stripe Checkout. Webhooks mark subscriptions active, changed, or canceled in your database.</p></div>
      <div class="card"><h3>Next step</h3><p class="muted">Wire the existing restock tracker to read the <code>alert_targets</code> table instead of a static config file, then sell access to those alerts.</p></div>
    </section>
  `;
  res.send(renderPage("Pokemon Alerts SaaS", body, user));
});

app.get("/pricing", (req, res) => {
  const user = ownerOverride(currentUser(req));
  const cards = Object.values(PLANS).map(plan => {
    const features = plan.features.map(x => `<li>${x}</li>`).join("");
    const cta = plan.id === "free"
      ? `<a href="${user ? "/dashboard" : "/register"}"><button>${user ? "Current free access" : "Start free"}</button></a>`
      : user
        ? `<form method="post" action="/create-checkout-session"><input type="hidden" name="planId" value="${plan.id}" /><button>Subscribe to ${plan.label}</button></form>`
        : `<a href="/login"><button>Login to subscribe</button></a>`;

    return `<div class="card"><h2>${plan.label}</h2><p>${plan.monthly}</p><ul>${features}</ul>${cta}</div>`;
  }).join("");

  res.send(renderPage("Pricing", `<div class="grid">${cards}</div>`, user));
});

app.get("/register", (req, res) => {
  const user = ownerOverride(currentUser(req));
  if (user) return res.redirect("/dashboard");
  const body = `
    <div class="card">
      <h1>Create account</h1>
      <form method="post" action="/register">
        <label>Email</label><input type="email" name="email" required />
        <label style="margin-top:12px; display:block;">Password</label><input type="password" name="password" required minlength="8" />
        <div style="margin-top:16px;"><button>Create account</button></div>
      </form>
    </div>`;
  res.send(renderPage("Register", body, null));
});

app.post("/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || password.length < 8) {
    return res.status(400).send(renderPage("Register", `<div class="card"><p class="danger">Use a valid email and a password with at least 8 characters.</p><a href="/register"><button>Back</button></a></div>`));
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(400).send(renderPage("Register", `<div class="card"><p class="danger">That email is already registered.</p><a href="/login"><button>Go to login</button></a></div>`));
  }

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, subscription_tier, subscription_status, alerts_quota)
    VALUES (?, ?, 'user', 'free', 'inactive', ?)
  `).run(email, hash, quotaForPlan("free"));

  const user = getUserById(result.lastInsertRowid);
  res.cookie("auth_token", signAuthCookie(user), { httpOnly: true, sameSite: "lax", secure: false });
  return res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
  const user = ownerOverride(currentUser(req));
  if (user) return res.redirect("/dashboard");
  const body = `
    <div class="card">
      <h1>Login</h1>
      <form method="post" action="/login">
        <label>Email</label><input type="email" name="email" required />
        <label style="margin-top:12px; display:block;">Password</label><input type="password" name="password" required />
        <div style="margin-top:16px;"><button>Login</button></div>
      </form>
    </div>`;
  res.send(renderPage("Login", body, null));
});

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
  const flash = String(req.query.flash || "").trim();
  const message = String(req.query.message || "").trim();

  const flashHtml = flash && message ? `
    <div class="card">
      <p class="${flash === "success" ? "success" : "danger"}">${escapeHtml(message)}</p>
    </div>
  ` : "";

  const rows = targets.length ? targets.map(t => `
    <tr>
      <td>${t.name}</td>
      <td>${t.retailer}</td>
      <td><a href="${t.product_url}" target="_blank" rel="noopener noreferrer">Open</a></td>
      <td>${t.channel_type}</td>
      <td>${t.active ? "Active" : "Paused"}</td>
      <td>
        <form method="post" action="/alerts/${t.id}/test" style="margin-bottom:8px;">
          <button>Send Test Alert</button>
        </form>
        <form method="post" action="/alerts/${t.id}/delete" onsubmit="return confirm('Delete this alert target?')">
          <button>Delete</button>
        </form>
      </td>
    </tr>`).join("")
  : `<tr><td colspan="6" class="muted">No alert targets yet.</td></tr>`;

  const body = `
    ${flashHtml}
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
          <label style="margin-top:12px; display:block;">Channel value</label><input name="channel_value" required placeholder="Discord webhook URL or email address" />
          <div style="margin-top:16px;"><button>Add target</button></div>
        </form>
      </div>
    </div>

    <div class="card">
      <h2>Your alert targets</h2>
      <table>
        <thead><tr><th>Name</th><th>Retailer</th><th>URL</th><th>Channel</th><th>Status</th><th>Action</th></tr></thead>
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

  if (!payload.name || !payload.retailer || !payload.product_url || !payload.channel_value) {
    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Fill in every field.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
  }

  db.prepare(`
    INSERT INTO alert_targets (user_id, name, retailer, product_url, channel_type, channel_value, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(user.id, payload.name, payload.retailer, payload.product_url, payload.channel_type, payload.channel_value);

  res.redirect("/dashboard");
});

app.post("/alerts/:id/test", requireAuth, async (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const alertId = Number(req.params.id);
  const target = db.prepare("SELECT * FROM alert_targets WHERE id = ? AND user_id = ?").get(alertId, user.id);

  if (!target) {
    return res.redirect("/dashboard?flash=error&message=Alert%20target%20not%20found");
  }

  try {
    await sendDiscordAlert(target, { timeAgo: "3 hours ago" });
    return res.redirect("/dashboard?flash=success&message=Test%20alert%20sent%20to%20Discord");
  } catch (err) {
    console.error("Test alert send failed:", err);
    return res.redirect("/dashboard?flash=error&message=Discord%20test%20send%20failed");
  }
});

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
      email: user.email,
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

app.listen(PORT, () => {
  console.log(`Pokemon Alerts SaaS running on ${APP_URL}`);
});
