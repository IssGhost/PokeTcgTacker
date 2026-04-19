require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const path = require("path");

const { createDb } = require("../db");
const { signAuthCookie, requireAuth } = require("../auth");
const {
  STATES,
  shouldAlertTransition,
  shouldAlertPriceDrop
} = require("../packages/core/state-engine");

const app = express();
const db = createDb(path.join(__dirname, "..", "app.db"));

const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const AUTO_SCAN_ENABLED = String(process.env.AUTO_SCAN_ENABLED || "true").toLowerCase() !== "false";
const AUTO_SCAN_INTERVAL_MS = Math.max(Number(process.env.AUTO_SCAN_INTERVAL_MS || 300000), 30000);
const AUTO_SEND_TARGET_UPDATES = String(process.env.AUTO_SEND_TARGET_UPDATES || "true").toLowerCase() !== "false";
const POKEMON_CENTER_MONITOR_ENABLED = String(process.env.POKEMON_CENTER_MONITOR_ENABLED || "true").toLowerCase() !== "false";
const POKEMON_CENTER_MONITOR_INTERVAL_MS = Math.max(Number(process.env.POKEMON_CENTER_MONITOR_INTERVAL_MS || 60000), 30000);
const POKEMON_CENTER_DIGEST_INTERVAL_MS = Math.max(Number(process.env.POKEMON_CENTER_DIGEST_INTERVAL_MS || 21600000), 300000);
const MAJOR_RETAIL_MONITOR_ENABLED = String(process.env.MAJOR_RETAIL_MONITOR_ENABLED || "true").toLowerCase() !== "false";
const MAJOR_RETAIL_MONITOR_INTERVAL_MS = Math.max(Number(process.env.MAJOR_RETAIL_MONITOR_INTERVAL_MS || 120000), 30000);
const POKEMON_CENTER_DISCOVERY_URLS = String(
  process.env.POKEMON_CENTER_DISCOVERY_URLS
    || "https://www.pokemoncenter.com/sitemap.xml,https://www.pokemoncenter.com/category/trading-card-game,https://www.pokemoncenter.com/category/new-releases,https://www.pokemoncenter.com/category/preorder,https://www.pokemoncenter.com/category/back-in-stock"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

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
      :root {
        --bg: #070b14;
        --panel: rgba(18, 27, 53, 0.88);
        --border: #293a70;
        --text: #eef2ff;
        --muted: #b4c2e5;
        --accent: #4f7cff;
      }
      body {
        font-family: Inter, Arial, sans-serif;
        margin: 0;
        background:
          radial-gradient(circle at 10% 10%, rgba(79,124,255,0.2), transparent 35%),
          linear-gradient(180deg, #060a13, #0b1020 45%, #0b1326);
        color: var(--text);
      }
      .wrap { max-width: 1180px; margin: 0 auto; padding: 24px; }
      .nav {
        display:flex; gap:16px; align-items:center; padding:16px 24px;
        background: rgba(10,16,33,0.92);
        backdrop-filter: blur(6px);
        border-bottom:1px solid var(--border);
        position: sticky; top: 0; z-index: 10;
      }
      .nav a, .linkbutton { color:#cfe1ff; text-decoration:none; background:none; border:none; cursor:pointer; font:inherit; padding:0; }
      .hero, .card {
        background: var(--panel);
        border:1px solid var(--border);
        border-radius:16px;
        padding:24px;
        margin-top:20px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.25);
      }
      .hero {
        background-image:
          linear-gradient(115deg, rgba(10,15,35,0.95), rgba(10,15,35,0.7)),
          url('https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?auto=format&fit=crop&w=1400&q=80');
        background-size: cover;
        background-position: center;
      }
      .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
      input, select, textarea { width:100%; padding:12px; border-radius:10px; border:1px solid #34467d; background:#0a1430; color:#eef2ff; }
      button { background:var(--accent); color:white; border:none; padding:12px 16px; border-radius:10px; cursor:pointer; font-weight:600; }
      button:hover { filter: brightness(1.08); }
      .muted { color:var(--muted); }
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

function getUserAlertPreferences(userId) {
  let prefs = db.prepare("SELECT * FROM user_alert_preferences WHERE user_id = ?").get(userId);
  if (!prefs) {
    db.prepare(`
      INSERT INTO user_alert_preferences (user_id, discord_enabled, email_enabled, sms_enabled, severity, retailer_scope_json)
      VALUES (?, 1, 0, 0, 'all', '[]')
    `).run(userId);
    prefs = db.prepare("SELECT * FROM user_alert_preferences WHERE user_id = ?").get(userId);
  }
  return prefs;
}

function logNotification(userId, channel, message, status = "queued") {
  db.prepare(`
    INSERT INTO notification_logs (user_id, channel, message, status)
    VALUES (?, ?, ?, ?)
  `).run(userId, channel, message, status);
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
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      reject(new Error("Invalid webhook URL"));
      return;
    }

    const body = JSON.stringify(payload);
    const req = https.request(parsedUrl, {
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

function getDiscordWebhookForTarget(target) {
  const targetWebhook = String(target.channel_value || "").trim();
  if (targetWebhook) return targetWebhook;
  return String(target.discord_webhook || "").trim();
}

function isValidDiscordWebhookUrl(value) {
  const urlValue = String(value || "").trim();
  if (!urlValue) return false;
  try {
    const parsed = new URL(urlValue);
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === "discord.com" && parsed.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

function getRequestClient(url) {
  return url.startsWith("https:") ? https : http;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function parseXmlLocEntries(xml) {
  const matches = [...String(xml || "").matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((match) => String(match[1] || "").trim()).filter(Boolean);
}

function parseProductLinksFromHtml(html) {
  const links = [...String(html || "").matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  return links
    .map((href) => {
      try {
        return new URL(href, "https://www.pokemoncenter.com").toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((url) => url.includes("/product/"));
}

function parseFirstPrice(text) {
  const match = String(text || "").match(/\$([0-9]+(?:\.[0-9]{2})?)/);
  if (!match) return null;
  return Number(match[1]);
}

function detectPokemonCenterState(html) {
  const text = String(html || "").toLowerCase();
  if (text.includes("preorder: add to cart") || text.includes("preorder: add to basket")) {
    return STATES.PREORDER_OPEN;
  }
  if (text.includes("coming soon")) return STATES.COMING_SOON;
  if (text.includes("add to cart") || text.includes("add to basket")) return STATES.IN_STOCK;
  if (text.includes("sold out") || text.includes("out of stock") || text.includes("currently unavailable")) {
    return STATES.OUT_OF_STOCK;
  }
  return STATES.LISTED;
}

function detectGenericRetailState(html) {
  const text = String(html || "").toLowerCase();
  if (text.includes("pre-order") || text.includes("preorder")) return STATES.PREORDER_OPEN;
  if (text.includes("in stock") || text.includes("add to cart") || text.includes("buy now")) return STATES.IN_STOCK;
  if (text.includes("sold out") || text.includes("out of stock") || text.includes("currently unavailable")) return STATES.OUT_OF_STOCK;
  return STATES.LISTED;
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = getRequestClient(url);
    const req = client.get(url, {
      headers: {
        "User-Agent": "PokemonAlertsBot/1.0 (+https://railway.app)"
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
        const nextUrl = new URL(res.headers.location, url).toString();
        resolve(fetchText(nextUrl, redirectCount + 1));
        return;
      }

      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        reject(new Error(`Product page fetch failed with ${res.statusCode}`));
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Product page fetch timed out"));
    });
  });
}

function detectAvailability(html, pageUrl = "") {
  const text = String(html || "").toLowerCase();
  const isTargetPage = String(pageUrl || "").includes("target.com");

  if (isTargetPage) {
    const statusMatches = [...String(html || "").matchAll(/"availability_status"\s*:\s*"([A-Z_]+)"/g)];
    const statusCounts = statusMatches.reduce((acc, match) => {
      const key = String(match[1] || "");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    if ((statusCounts.IN_STOCK || 0) > 0) return "in_stock";
    if ((statusCounts.PRE_ORDER || 0) > 0) return "pre_order";
    if ((statusCounts.OUT_OF_STOCK || 0) > 0) return "out_of_stock";
  }

  const inStockKeywords = [
    "in stock",
    "add to cart",
    "available now",
    "pickup available",
    "ship it"
  ];
  const outOfStockKeywords = [
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available"
  ];
  const preOrderKeywords = [
    "preorder",
    "pre-order",
    "pre order"
  ];

  const hasInStock = inStockKeywords.some((keyword) => text.includes(keyword));
  const hasOutOfStock = outOfStockKeywords.some((keyword) => text.includes(keyword));
  const hasPreOrder = preOrderKeywords.some((keyword) => text.includes(keyword));

  if (hasInStock) return "in_stock";
  if (hasPreOrder) return "pre_order";
  if (hasOutOfStock) return "out_of_stock";
  return "unknown";
}

async function scanAlertTarget(target) {
  try {
    const html = await fetchText(target.product_url);
    return {
      status: detectAvailability(html, target.product_url),
      error: null
    };
  } catch (err) {
    return {
      status: "unknown",
      error: err
    };
  }
}

function ensureProductAndOffer(productUrl, title, price, state, retailerKey = "pokemoncenter", options = {}) {
  const retailer = db.prepare("SELECT * FROM retailers WHERE adapter_key = ?").get(retailerKey);
  if (!retailer) {
    throw new Error(`Retailer not found for adapter key: ${retailerKey}`);
  }
  const canonicalName = String(title || "Unknown Pokémon Center Product").trim();
  const canonicalSlug = slugify(canonicalName) || slugify(productUrl);
  let product = db.prepare("SELECT * FROM products WHERE canonical_slug = ?").get(canonicalSlug);
  if (!product) {
    const insert = db.prepare(`
      INSERT INTO products (canonical_name, canonical_slug, brand)
      VALUES (?, ?, 'Pokemon')
    `).run(canonicalName, canonicalSlug);
    product = db.prepare("SELECT * FROM products WHERE id = ?").get(insert.lastInsertRowid);
  }

  let offer = db.prepare("SELECT * FROM product_offers WHERE product_url = ?").get(productUrl);
  if (!offer) {
    const insert = db.prepare(`
      INSERT INTO product_offers (product_id, retailer_id, retailer_sku, product_url, last_seen_price, current_state, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(product.id, retailer.id, options.retailerSku || null, productUrl, price, state, new Date().toISOString());
    offer = db.prepare("SELECT * FROM product_offers WHERE id = ?").get(insert.lastInsertRowid);
  }

  return { product, offer };
}

async function sendPokemonCenterDiscordEvent(userId, event) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const prefs = getUserAlertPreferences(userId);
  const webhook = String(user?.discord_webhook || "").trim();

  const content = [
    `Pokémon Center ${event.newState}: ${event.productName}`,
    `URL: ${event.productUrl}`,
    `Price: ${event.newPrice == null ? "N/A" : `$${event.newPrice.toFixed(2)}`}`,
    `Transition: ${event.oldState || STATES.UNKNOWN} -> ${event.newState}`
  ].join("\n");

  if (prefs.discord_enabled && isValidDiscordWebhookUrl(webhook)) {
    await postJson(webhook, { content });
    logNotification(userId, "discord", content, "sent");
  }

  if (prefs.email_enabled) {
    // Phase 4 placeholder; replace with provider integration when keys are configured.
    logNotification(userId, "email", content, "queued");
  }

  if (prefs.sms_enabled) {
    // Phase 4 placeholder; replace with provider integration when keys are configured.
    logNotification(userId, "sms", content, "queued");
  }
}

async function monitorPokemonCenterProduct(productUrl) {
  const html = await fetchText(productUrl);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s*\|\s*Pokémon Center\s*$/i, "").trim() : "Pokémon Center Product";
  const state = detectPokemonCenterState(html);
  const price = parseFirstPrice(html);
  const snapshotHash = crypto.createHash("sha1").update(html).digest("hex");
  const nowIso = new Date().toISOString();

  const { product, offer } = ensureProductAndOffer(productUrl, title, price, state);
  const oldState = offer.current_state || STATES.UNKNOWN;
  const oldPrice = typeof offer.last_seen_price === "number" ? offer.last_seen_price : null;

  db.prepare(`
    UPDATE product_offers
    SET last_seen_price = ?,
        current_state = ?,
        last_seen_at = ?,
        last_in_stock_at = CASE WHEN ? = ? THEN ? ELSE last_in_stock_at END
    WHERE id = ?
  `).run(price, state, nowIso, state, STATES.IN_STOCK, nowIso, offer.id);

  const transitioned = shouldAlertTransition(oldState, state);
  const droppedPrice = shouldAlertPriceDrop(oldPrice, price, 7);

  if (transitioned || droppedPrice) {
    db.prepare(`
      INSERT INTO events (product_offer_id, event_type, old_state, new_state, old_price, new_price, raw_snapshot_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      offer.id,
      droppedPrice && !transitioned ? STATES.PRICE_CHANGED : "STATE_CHANGED",
      oldState,
      state,
      oldPrice,
      price,
      snapshotHash
    );
  }

  return {
    product,
    offerId: offer.id,
    state,
    oldState,
    price,
    oldPrice,
    transitioned,
    droppedPrice,
    snapshotHash
  };
}

async function discoverPokemonCenterProductUrls() {
  const found = new Set();

  for (const sourceUrl of POKEMON_CENTER_DISCOVERY_URLS) {
    try {
      const payload = await fetchText(sourceUrl);
      const urls = sourceUrl.endsWith(".xml")
        ? parseXmlLocEntries(payload)
        : parseProductLinksFromHtml(payload);
      urls.forEach((url) => {
        if (url.includes("pokemoncenter.com") && url.includes("/product/")) {
          found.add(url.split("?")[0]);
        }
      });
    } catch (err) {
      console.error(`Pokemon Center discovery failed for ${sourceUrl}:`, err.message);
    }
  }

  return [...found];
}

async function runPokemonCenterDiscovery() {
  const urls = await discoverPokemonCenterProductUrls();
  for (const url of urls) {
    ensureProductAndOffer(url, "Pokemon Center Listing", null, STATES.LISTED);
  }
  return urls.length;
}

function sixHoursAgoIso() {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
}

async function sendPokemonCenterDigest() {
  const users = db.prepare(`
    SELECT id, discord_webhook
    FROM users
    WHERE discord_webhook IS NOT NULL AND trim(discord_webhook) != ''
  `).all();
  const since = sixHoursAgoIso();

  const counts = db.prepare(`
    SELECT event_type, COUNT(*) AS c
    FROM events
    WHERE created_at >= ?
    GROUP BY event_type
  `).all(since);
  const stateChanged = counts.find((row) => row.event_type === "STATE_CHANGED")?.c || 0;
  const priceChanged = counts.find((row) => row.event_type === STATES.PRICE_CHANGED)?.c || 0;
  const monitorRuns = db.prepare("SELECT COUNT(*) AS c FROM monitor_runs WHERE started_at >= ?").get(since).c;
  const topItems = db.prepare(`
    SELECT p.canonical_name, COUNT(*) AS c
    FROM events e
    JOIN product_offers po ON po.id = e.product_offer_id
    JOIN products p ON p.id = po.product_id
    WHERE e.created_at >= ?
    GROUP BY p.canonical_name
    ORDER BY c DESC
    LIMIT 5
  `).all(since);
  const topLines = topItems.length
    ? topItems.map((item, idx) => `${idx + 1}. ${item.canonical_name} (${item.c})`).join("\n")
    : "No events in the last 6 hours";

  for (const user of users) {
    if (!isValidDiscordWebhookUrl(user.discord_webhook)) continue;
    const content = [
      "Pokémon Center 6-hour digest",
      `Monitor runs: ${monitorRuns}`,
      `State-change alerts: ${stateChanged}`,
      `Price-change alerts: ${priceChanged}`,
      "Top items:",
      topLines
    ].join("\n");
    await postJson(user.discord_webhook, { content });
  }
}

async function runPokemonCenterMonitorCycle() {
  const startedAt = new Date().toISOString();
  const runInsert = db.prepare(`
    INSERT INTO monitor_runs (adapter_key, started_at, status, requests_made, errors_count)
    VALUES ('pokemoncenter', ?, 'running', 0, 0)
  `).run(startedAt);

  let requestsMade = 0;
  let errorsCount = 0;
  try {
    const discoveryCount = await runPokemonCenterDiscovery();
    const offers = db.prepare(`
      SELECT po.id, po.product_url
      FROM product_offers po
      JOIN retailers r ON r.id = po.retailer_id
      WHERE r.adapter_key = 'pokemoncenter'
      ORDER BY po.id DESC
      LIMIT 200
    `).all();

    for (const offer of offers) {
      try {
        const result = await monitorPokemonCenterProduct(offer.product_url);
        requestsMade += 1;
        if (result.transitioned || result.droppedPrice) {
          const watchers = db.prepare(`
            SELECT DISTINCT w.user_id
            FROM watchlists w
            JOIN products p ON p.id = w.product_id
            JOIN product_offers po ON po.product_id = p.id
            WHERE po.id = ?
          `).all(result.offerId);
          for (const watcher of watchers) {
            await sendPokemonCenterDiscordEvent(watcher.user_id, {
              productName: result.product.canonical_name,
              productUrl: offer.product_url,
              newPrice: result.price,
              oldState: result.oldState,
              newState: result.state
            });
          }
        }
      } catch (err) {
        errorsCount += 1;
        console.error(`Pokemon Center monitor failed for ${offer.product_url}:`, err.message);
      }
    }

    db.prepare(`
      UPDATE monitor_runs
      SET finished_at = ?, status = 'ok', requests_made = ?, errors_count = ?
      WHERE id = ?
    `).run(new Date().toISOString(), requestsMade + discoveryCount, errorsCount, runInsert.lastInsertRowid);
  } catch (err) {
    db.prepare(`
      UPDATE monitor_runs
      SET finished_at = ?, status = 'failed', requests_made = ?, errors_count = ?
      WHERE id = ?
    `).run(new Date().toISOString(), requestsMade, errorsCount + 1, runInsert.lastInsertRowid);
    throw err;
  }
}

async function fetchBestBuyProductBySku(sku) {
  const apiKey = String(process.env.BESTBUY_API_KEY || "").trim();
  if (!apiKey || !sku) return null;
  const endpoint = `https://api.bestbuy.com/v1/products(sku=${encodeURIComponent(sku)})?format=json&show=sku,name,salePrice,onlineAvailability,url&apiKey=${apiKey}`;
  const payload = await fetchText(endpoint);
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed.products) || parsed.products.length === 0) return null;
  return parsed.products[0];
}

async function monitorMajorRetailOffer(offerRow) {
  const nowIso = new Date().toISOString();
  let title = offerRow.canonical_name || "Retail Product";
  let state = STATES.LISTED;
  let price = null;

  if (offerRow.adapter_key === "bestbuy" && offerRow.retailer_sku) {
    try {
      const bestBuyProduct = await fetchBestBuyProductBySku(offerRow.retailer_sku);
      if (bestBuyProduct) {
        title = bestBuyProduct.name || title;
        price = typeof bestBuyProduct.salePrice === "number" ? bestBuyProduct.salePrice : null;
        state = bestBuyProduct.onlineAvailability ? STATES.IN_STOCK : STATES.OUT_OF_STOCK;
      }
    } catch (err) {
      console.error(`Best Buy API lookup failed for SKU ${offerRow.retailer_sku}:`, err.message);
    }
  }

  if (state === STATES.LISTED) {
    const html = await fetchText(offerRow.product_url);
    price = parseFirstPrice(html);
    if (offerRow.adapter_key === "target") {
      const targetState = detectAvailability(html, offerRow.product_url);
      if (targetState === "in_stock") state = STATES.IN_STOCK;
      else if (targetState === "pre_order") state = STATES.PREORDER_OPEN;
      else if (targetState === "out_of_stock") state = STATES.OUT_OF_STOCK;
      else state = STATES.LISTED;
    } else {
      state = detectGenericRetailState(html);
    }
  }

  const oldState = offerRow.current_state || STATES.UNKNOWN;
  const oldPrice = typeof offerRow.last_seen_price === "number" ? offerRow.last_seen_price : null;

  db.prepare(`
    UPDATE product_offers
    SET last_seen_price = ?,
        current_state = ?,
        last_seen_at = ?,
        last_in_stock_at = CASE WHEN ? = ? THEN ? ELSE last_in_stock_at END
    WHERE id = ?
  `).run(price, state, nowIso, state, STATES.IN_STOCK, nowIso, offerRow.id);

  const transitioned = shouldAlertTransition(oldState, state);
  const droppedPrice = shouldAlertPriceDrop(oldPrice, price, 7);
  if (transitioned || droppedPrice) {
    db.prepare(`
      INSERT INTO events (product_offer_id, event_type, old_state, new_state, old_price, new_price, raw_snapshot_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      offerRow.id,
      droppedPrice && !transitioned ? STATES.PRICE_CHANGED : "STATE_CHANGED",
      oldState,
      state,
      oldPrice,
      price,
      `${offerRow.adapter_key}:${Date.now()}`
    );
  }

  return { transitioned, droppedPrice, state, title, price, oldState };
}

async function runMajorRetailMonitorCycle() {
  const startedAt = new Date().toISOString();
  const runInsert = db.prepare(`
    INSERT INTO monitor_runs (adapter_key, started_at, status, requests_made, errors_count)
    VALUES ('major-retail', ?, 'running', 0, 0)
  `).run(startedAt);

  let requestsMade = 0;
  let errorsCount = 0;
  try {
    const offers = db.prepare(`
      SELECT po.*, r.adapter_key, p.canonical_name
      FROM product_offers po
      JOIN retailers r ON r.id = po.retailer_id
      JOIN products p ON p.id = po.product_id
      WHERE r.adapter_key IN ('bestbuy','target','walmart','gamestop')
      ORDER BY po.id DESC
      LIMIT 300
    `).all();

    for (const offer of offers) {
      try {
        await monitorMajorRetailOffer(offer);
        requestsMade += 1;
      } catch (err) {
        errorsCount += 1;
        console.error(`Major retail monitor failed for ${offer.product_url}:`, err.message);
      }
    }

    db.prepare(`
      UPDATE monitor_runs
      SET finished_at = ?, status = 'ok', requests_made = ?, errors_count = ?
      WHERE id = ?
    `).run(new Date().toISOString(), requestsMade, errorsCount, runInsert.lastInsertRowid);
  } catch (err) {
    db.prepare(`
      UPDATE monitor_runs
      SET finished_at = ?, status = 'failed', requests_made = ?, errors_count = ?
      WHERE id = ?
    `).run(new Date().toISOString(), requestsMade, errorsCount + 1, runInsert.lastInsertRowid);
    throw err;
  }
}

function formatTimeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const totalMinutes = Math.max(Math.round(diffMs / 60000), 0);
  if (totalMinutes < 60) return `${totalMinutes} minutes ago`;
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} hours ago`;
  const totalDays = Math.round(totalHours / 24);
  return `${totalDays} days ago`;
}

function normalizeRetailer(value) {
  return String(value || "").trim().toLowerCase();
}

function isTargetRetailer(value) {
  return normalizeRetailer(value).includes("target");
}

function retailerSearchUrl(retailer, productName) {
  const normalizedRetailer = normalizeRetailer(retailer);
  const encodedName = encodeURIComponent(String(productName || "").trim());
  if (!encodedName) return null;

  if (normalizedRetailer.includes("target")) {
    return `https://www.target.com/s?searchTerm=${encodedName}`;
  }
  return null;
}

function statusLabel(status) {
  if (status === "in_stock") return "IN STOCK";
  if (status === "out_of_stock") return "OUT OF STOCK";
  if (status === "pre_order") return "PRE-ORDER";
  return "UNKNOWN";
}

async function sendMarketSnapshot(user) {
  throw new Error("sendMarketSnapshot is deprecated. Use sendTarget24hUpdate instead.");
}

function buildTarget24hSummary(userId) {
  const recentEvents = db.prepare(`
    SELECT e.created_at, e.event_type, t.name, t.retailer, t.product_url
    FROM alert_events e
    JOIN alert_targets t ON t.id = e.alert_target_id
    WHERE e.user_id = ?
      AND lower(t.retailer) LIKE '%target%'
      AND e.created_at >= datetime('now', '-24 hours')
    ORDER BY e.created_at DESC
    LIMIT 25
  `).all(userId);

  const currentInStock = db.prepare(`
    SELECT id, name, retailer, product_url, last_scan_at
    FROM alert_targets
    WHERE user_id = ?
      AND active = 1
      AND channel_type = 'discord'
      AND lower(retailer) LIKE '%target%'
      AND last_scan_status = 'in_stock'
    ORDER BY last_scan_at DESC
  `).all(userId);

  const currentPreOrder = db.prepare(`
    SELECT id, name, retailer, product_url, last_scan_at
    FROM alert_targets
    WHERE user_id = ?
      AND active = 1
      AND channel_type = 'discord'
      AND lower(retailer) LIKE '%target%'
      AND last_scan_status = 'pre_order'
    ORDER BY last_scan_at DESC
  `).all(userId);

  const currentOutOfStock = db.prepare(`
    SELECT id, name, retailer, product_url, last_scan_at
    FROM alert_targets
    WHERE user_id = ?
      AND active = 1
      AND channel_type = 'discord'
      AND lower(retailer) LIKE '%target%'
      AND last_scan_status = 'out_of_stock'
    ORDER BY last_scan_at DESC
  `).all(userId);

  return {
    recentEvents,
    currentInStock,
    currentPreOrder,
    currentOutOfStock
  };
}

async function sendTarget24hUpdate(user) {
  const webhook = String(user.discord_webhook || "").trim();
  if (!isValidDiscordWebhookUrl(webhook)) {
    throw new Error("A valid default Discord webhook is required to send Target updates.");
  }

  const summary = buildTarget24hSummary(user.id);
  const eventLines = summary.recentEvents.slice(0, 10).map((event) => {
    return `- ${event.created_at} | ${statusLabel(event.event_type === "in_stock" ? "in_stock" : "unknown")} | ${event.name} | ${event.product_url}`;
  });

  const content = [
    "Target 24-Hour Stock Update",
    `In-stock detections in last 24 hours: ${summary.recentEvents.length}`,
    `Currently in stock right now: ${summary.currentInStock.length}`,
    `Currently pre-order right now: ${summary.currentPreOrder.length}`,
    `Currently out of stock right now: ${summary.currentOutOfStock.length}`,
    "",
    "Recent events:",
    ...(eventLines.length ? eventLines : ["- No in-stock events logged in last 24 hours"])
  ].join("\n");

  return postJson(webhook, { content });
}

async function sendAutomatedTargetUpdates() {
  const users = db.prepare(`
    SELECT id, discord_webhook
    FROM users
    WHERE discord_webhook IS NOT NULL
      AND trim(discord_webhook) != ''
  `).all();

  for (const userRecord of users) {
    if (!isValidDiscordWebhookUrl(userRecord.discord_webhook)) {
      continue;
    }

    try {
      await sendTarget24hUpdate(userRecord);
    } catch (err) {
      console.error(`Automated Target update failed for user ${userRecord.id}:`, err.message);
    }
  }
}

async function runAutomatedScan(userId = null, options = {}) {
  const targetOnly = options.targetOnly !== false;
  const targets = db.prepare(`
    SELECT t.*, u.discord_webhook
    FROM alert_targets t
    JOIN users u ON u.id = t.user_id
    WHERE t.active = 1 AND t.channel_type = 'discord'
      AND (? IS NULL OR t.user_id = ?)
    ORDER BY t.id ASC
  `).all(userId, userId);

  for (const target of targets) {
    if (targetOnly && !isTargetRetailer(target.retailer)) {
      continue;
    }

    const webhook = getDiscordWebhookForTarget(target);
    const startedAt = new Date().toISOString();
    const result = await scanAlertTarget(target);

    db.prepare(`
      UPDATE alert_targets
      SET last_scan_status = ?, last_scan_at = ?
      WHERE id = ?
    `).run(result.status, startedAt, target.id);

    if (result.error) {
      console.error(`Scan failed for target ${target.id}:`, result.error.message);
      continue;
    }

    if (!webhook) continue;
    if (!isValidDiscordWebhookUrl(webhook)) {
      console.error(`Skipping invalid Discord webhook for target ${target.id}`);
      continue;
    }
    if (result.status !== "in_stock") continue;
    if (target.last_scan_status === "in_stock") continue;

    const syntheticTarget = { ...target, channel_value: webhook };
    await sendDiscordAlert(syntheticTarget, { timeAgo: formatTimeAgo(new Date(startedAt)) });

    db.prepare(`
      UPDATE alert_targets
      SET last_alerted_at = ?
      WHERE id = ?
    `).run(startedAt, target.id);

    db.prepare(`
      INSERT INTO alert_events (alert_target_id, user_id, event_type, event_message)
      VALUES (?, ?, 'in_stock', ?)
    `).run(target.id, target.user_id, `${target.name} in stock at ${target.retailer}`);
  }
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
  const prefs = getUserAlertPreferences(user.id);
  const targets = db.prepare("SELECT * FROM alert_targets WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
  const targetSummary = buildTarget24hSummary(user.id);
  const releases = db.prepare(`
    SELECT id, title, set_name, release_date
    FROM release_calendar
    WHERE release_date >= date('now')
    ORDER BY release_date ASC
    LIMIT 5
  `).all();
  const latestMonitorRuns = db.prepare(`
    SELECT adapter_key, status, started_at, finished_at, requests_made, errors_count
    FROM monitor_runs
    ORDER BY started_at DESC
    LIMIT 8
  `).all();
  const marketRows = db.prepare(`
    SELECT product_name, source_name, price, url, captured_at
    FROM market_snapshots
    ORDER BY captured_at DESC
    LIMIT 6
  `).all();
  const notificationRows = db.prepare(`
    SELECT channel, status, created_at
    FROM notification_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 6
  `).all(user.id);
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
      <td>${t.last_scan_status || "unknown"}</td>
      <td>
        <form method="post" action="/alerts/${t.id}/test" style="margin-bottom:8px;">
          <button>Send Test Alert</button>
        </form>
        <form method="post" action="/alerts/${t.id}/delete" onsubmit="return confirm('Delete this alert target?')">
          <button>Delete</button>
        </form>
        <form method="post" action="/alerts/${t.id}/find-link" style="margin-top:8px;">
          <button>Find store link</button>
        </form>
      </td>
    </tr>`).join("")
  : `<tr><td colspan="7" class="muted">No alert targets yet.</td></tr>`;

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
        <h2>Target drop tools</h2>
        <p class="muted">Current implementation is Target-only: scan now, track current Target drops, and send a 24-hour recap.</p>
        <form method="post" action="/settings/discord-webhook">
          <label>Default Discord webhook</label>
          <input name="discord_webhook" type="url" placeholder="https://discord.com/api/webhooks/..." value="${escapeHtml(user.discord_webhook || "")}" />
          <div style="margin-top:16px;"><button>Save default webhook</button></div>
        </form>
        <form method="post" action="/alerts/target/scan-now" style="margin-top:12px;">
          <button>Scan Target drops now</button>
        </form>
        <form method="post" action="/alerts/target/send-update" style="margin-top:12px;">
          <button>Send Target 24h update to Discord</button>
        </form>
      </div>
      <div class="card">
        <h2>Pokémon Center MVP tools</h2>
        <p class="muted">Phase 1 runtime: discovery + monitor + digest.</p>
        <form method="post" action="/pokemoncenter/discovery/run">
          <button>Run Pokémon Center discovery</button>
        </form>
        <form method="post" action="/pokemoncenter/monitor/run" style="margin-top:12px;">
          <button>Run Pokémon Center monitor</button>
        </form>
        <form method="post" action="/pokemoncenter/digest/send" style="margin-top:12px;">
          <button>Send Pokémon Center 6h digest now</button>
        </form>
      </div>
      <div class="card">
        <h2>Major retail (Phase 2) tools</h2>
        <p class="muted">Monitor Best Buy, Target, Walmart, and GameStop offers using adapter-aware checks.</p>
        <form method="post" action="/retail/monitor/run">
          <button>Run major retail monitor</button>
        </form>
        <form method="post" action="/retail/offers/add" style="margin-top:12px;">
          <label>Retailer</label>
          <select name="retailer_key">
            <option value="bestbuy">Best Buy</option>
            <option value="target">Target</option>
            <option value="walmart">Walmart</option>
            <option value="gamestop">GameStop</option>
          </select>
          <label style="margin-top:12px; display:block;">Product name</label>
          <input name="name" required placeholder="Surging Sparks ETB" />
          <label style="margin-top:12px; display:block;">Product URL</label>
          <input name="product_url" required type="url" placeholder="https://..." />
          <label style="margin-top:12px; display:block;">Retailer SKU (Best Buy optional)</label>
          <input name="retailer_sku" placeholder="1234567" />
          <div style="margin-top:12px;"><button>Add retail offer</button></div>
        </form>
      </div>
      <div class="card">
        <h2>Add alert target</h2>
        <form method="post" action="/alerts">
          <label>Name</label><input name="name" required placeholder="Journey Together ETB" />
          <label style="margin-top:12px; display:block;">Retailer</label><input name="retailer" required placeholder="Target" />
          <label style="margin-top:12px; display:block;">Product URL</label><input name="product_url" type="url" placeholder="Optional. Auto-built from Name + Retailer for Target only." />
          <label style="margin-top:12px; display:block;">Channel type</label>
          <select name="channel_type">
            <option value="discord">Discord webhook</option>
            <option value="email">Email placeholder</option>
          </select>
          <label style="margin-top:12px; display:block;">Channel value</label><input name="channel_value" placeholder="Optional for Discord if default webhook is set" />
          <div style="margin-top:16px;"><button>Add target</button></div>
        </form>
      </div>
      <div class="card">
        <h2>Alert preferences</h2>
        <form method="post" action="/settings/alert-preferences">
          <label>Severity</label>
          <select name="severity">
            <option value="all" ${prefs.severity === "all" ? "selected" : ""}>All alerts</option>
            <option value="high" ${prefs.severity === "high" ? "selected" : ""}>High only</option>
            <option value="medium" ${prefs.severity === "medium" ? "selected" : ""}>Medium+</option>
          </select>
          <label style="margin-top:12px; display:block;">Price ceiling (optional)</label>
          <input name="price_ceiling" type="number" step="0.01" value="${prefs.price_ceiling ?? ""}" />
          <label style="margin-top:12px; display:block;"><input type="checkbox" name="discord_enabled" ${prefs.discord_enabled ? "checked" : ""}/> Discord</label>
          <label style="margin-top:6px; display:block;"><input type="checkbox" name="email_enabled" ${prefs.email_enabled ? "checked" : ""}/> Email</label>
          <label style="margin-top:6px; display:block;"><input type="checkbox" name="sms_enabled" ${prefs.sms_enabled ? "checked" : ""}/> SMS</label>
          <div style="margin-top:12px;"><button>Save preferences</button></div>
        </form>
      </div>
    </div>

    <div class="card">
      <h2>Your alert targets</h2>
      <table>
        <thead><tr><th>Name</th><th>Retailer</th><th>URL</th><th>Channel</th><th>Status</th><th>Last scan</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Target update (last 24 hours + right now)</h2>
      <p><strong>In-stock detections (24h):</strong> ${targetSummary.recentEvents.length}</p>
      <p><strong>Current Target drops in stock right now:</strong> ${targetSummary.currentInStock.length}</p>
      <p><strong>Current Target drops in pre-order right now:</strong> ${targetSummary.currentPreOrder.length}</p>
      <p><strong>Current Target drops out of stock right now:</strong> ${targetSummary.currentOutOfStock.length}</p>
      <ul>
        ${targetSummary.recentEvents.length
          ? targetSummary.recentEvents.slice(0, 10).map((event) => `<li>${escapeHtml(event.created_at)} — ${escapeHtml(event.name)} — <a href="${event.product_url}" target="_blank" rel="noopener noreferrer">Open</a></li>`).join("")
          : "<li class=\"muted\">No Target in-stock events recorded in the last 24 hours yet.</li>"}
      </ul>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Release calendar</h2>
        <p class="muted">Upcoming launches.</p>
        <ul>
          ${releases.length
            ? releases.map((item) => `<li>${escapeHtml(item.release_date)} — ${escapeHtml(item.title)}${item.set_name ? ` (${escapeHtml(item.set_name)})` : ""}</li>`).join("")
            : "<li class=\"muted\">No upcoming releases yet.</li>"}
        </ul>
        <a href="/calendar"><button>Open calendar</button></a>
      </div>
      <div class="card">
        <h2>Health dashboard</h2>
        <p class="muted">Latest monitor runs.</p>
        <ul>
          ${latestMonitorRuns.length
            ? latestMonitorRuns.map((run) => `<li>${escapeHtml(run.adapter_key)} — ${escapeHtml(run.status)} — req:${run.requests_made} err:${run.errors_count}</li>`).join("")
            : "<li class=\"muted\">No monitor runs yet.</li>"}
        </ul>
        <a href="/health/dashboard"><button>Open health dashboard</button></a>
      </div>
      <div class="card">
        <h2>Market watch (Phase 4)</h2>
        <p class="muted">Optional market-price lane, separated from live retail alerts.</p>
        <ul>
          ${marketRows.length
            ? marketRows.map((row) => `<li>${escapeHtml(row.product_name)} — ${escapeHtml(row.source_name)} — ${row.price == null ? "N/A" : `$${Number(row.price).toFixed(2)}`}</li>`).join("")
            : "<li class=\"muted\">No market snapshots yet.</li>"}
        </ul>
        <p class="muted" style="margin-top:12px;">Recent notification activity</p>
        <ul>
          ${notificationRows.length
            ? notificationRows.map((row) => `<li>${escapeHtml(row.channel)} — ${escapeHtml(row.status)} — ${escapeHtml(row.created_at)}</li>`).join("")
            : "<li class=\"muted\">No notifications logged yet.</li>"}
        </ul>
        ${user.role === "owner" ? `
          <form method="post" action="/market/snapshot" style="margin-top:12px;">
            <label>Product</label><input name="product_name" required placeholder="Prismatic Evolutions ETB" />
            <label style="margin-top:8px; display:block;">Source</label><input name="source_name" required placeholder="TCGPlayer" />
            <label style="margin-top:8px; display:block;">Price</label><input name="price" type="number" step="0.01" />
            <label style="margin-top:8px; display:block;">URL</label><input name="url" type="url" />
            <div style="margin-top:10px;"><button>Save market snapshot</button></div>
          </form>
        ` : ""}
      </div>
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

  const fallbackWebhook = String(user.discord_webhook || "").trim();
  if (!payload.name || !payload.retailer) {
    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Fill in every field.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
  }
  if (!payload.product_url) {
    payload.product_url = retailerSearchUrl(payload.retailer, payload.name) || "";
  }
  if (!payload.product_url) {
    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Add a product URL, or use retailer Target for auto-linking.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
  }
  if (payload.channel_type === "discord" && !payload.channel_value && !fallbackWebhook) {
    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Add a channel value or set a default Discord webhook first.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
  }
  const finalChannelValue = payload.channel_type === "discord" && !payload.channel_value
    ? fallbackWebhook
    : payload.channel_value;
  if (payload.channel_type === "discord" && !isValidDiscordWebhookUrl(finalChannelValue)) {
    return res.status(400).send(renderPage("Invalid target", `<div class="card"><p class="danger">Use a valid Discord webhook URL.</p><a href="/dashboard"><button>Back</button></a></div>`, user));
  }

  db.prepare(`
    INSERT INTO alert_targets (user_id, name, retailer, product_url, channel_type, channel_value, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(user.id, payload.name, payload.retailer, payload.product_url, payload.channel_type, finalChannelValue);

  res.redirect("/dashboard");
});

app.post("/alerts/:id/find-link", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const alertId = Number(req.params.id);
  const target = db.prepare("SELECT * FROM alert_targets WHERE id = ? AND user_id = ?").get(alertId, user.id);

  if (!target) {
    return res.redirect("/dashboard?flash=error&message=Alert%20target%20not%20found");
  }

  const guessedUrl = retailerSearchUrl(target.retailer, target.name);
  if (!guessedUrl) {
    return res.redirect("/dashboard?flash=error&message=Could%20not%20auto-build%20a%20store%20link%20for%20this%20retailer");
  }

  db.prepare("UPDATE alert_targets SET product_url = ? WHERE id = ? AND user_id = ?").run(guessedUrl, alertId, user.id);
  return res.redirect("/dashboard?flash=success&message=Store%20search%20link%20updated");
});

app.post("/settings/discord-webhook", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const webhook = String(req.body.discord_webhook || "").trim();
  if (webhook && !isValidDiscordWebhookUrl(webhook)) {
    return res.redirect("/dashboard?flash=error&message=Please%20enter%20a%20valid%20Discord%20webhook%20URL");
  }
  db.prepare("UPDATE users SET discord_webhook = ? WHERE id = ?").run(webhook || null, user.id);
  res.redirect("/dashboard?flash=success&message=Default%20Discord%20webhook%20saved");
});

app.post("/settings/alert-preferences", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const severity = String(req.body.severity || "all").trim().toLowerCase();
  const allowedSeverity = ["all", "high", "medium"];
  const priceCeilingRaw = String(req.body.price_ceiling || "").trim();
  const priceCeiling = priceCeilingRaw ? Number(priceCeilingRaw) : null;
  const discordEnabled = req.body.discord_enabled ? 1 : 0;
  const emailEnabled = req.body.email_enabled ? 1 : 0;
  const smsEnabled = req.body.sms_enabled ? 1 : 0;

  db.prepare(`
    INSERT INTO user_alert_preferences (user_id, discord_enabled, email_enabled, sms_enabled, severity, retailer_scope_json, price_ceiling, updated_at)
    VALUES (?, ?, ?, ?, ?, '[]', ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      discord_enabled = excluded.discord_enabled,
      email_enabled = excluded.email_enabled,
      sms_enabled = excluded.sms_enabled,
      severity = excluded.severity,
      price_ceiling = excluded.price_ceiling,
      updated_at = excluded.updated_at
  `).run(
    user.id,
    discordEnabled,
    emailEnabled,
    smsEnabled,
    allowedSeverity.includes(severity) ? severity : "all",
    Number.isFinite(priceCeiling) ? priceCeiling : null,
    new Date().toISOString()
  );

  return res.redirect("/dashboard?flash=success&message=Alert%20preferences%20saved");
});

app.post("/alerts/target/scan-now", requireAuth, async (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  try {
    await runAutomatedScan(user.id, { targetOnly: true });
    return res.redirect("/dashboard?flash=success&message=Target%20scan%20completed.%20Check%20the%2024h%20update%20card%20below.");
  } catch (err) {
    console.error("Manual scan failed:", err);
    return res.redirect("/dashboard?flash=error&message=Target%20scan%20failed");
  }
});

app.post("/alerts/target/send-update", requireAuth, async (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  try {
    await sendTarget24hUpdate(user);
    return res.redirect("/dashboard?flash=success&message=Target%2024h%20update%20sent%20to%20Discord");
  } catch (err) {
    console.error("Target update send failed:", err);
    return res.redirect("/dashboard?flash=error&message=Target%20update%20send%20failed.%20Set%20a%20valid%20default%20webhook.");
  }
});

app.post("/alerts/:id/test", requireAuth, async (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const alertId = Number(req.params.id);
  const target = db.prepare("SELECT * FROM alert_targets WHERE id = ? AND user_id = ?").get(alertId, user.id);

  if (!target) {
    return res.redirect("/dashboard?flash=error&message=Alert%20target%20not%20found");
  }

  try {
    const webhook = getDiscordWebhookForTarget({ ...target, discord_webhook: user.discord_webhook });
    if (!webhook) {
      return res.redirect("/dashboard?flash=error&message=Missing%20Discord%20webhook%20for%20this%20target");
    }
    if (!isValidDiscordWebhookUrl(webhook)) {
      return res.redirect("/dashboard?flash=error&message=Discord%20webhook%20URL%20is%20invalid");
    }
    await sendDiscordAlert({ ...target, channel_value: webhook }, { timeAgo: "3 hours ago" });
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

app.post("/pokemoncenter/discovery/run", requireAuth, async (req, res) => {
  try {
    const count = await runPokemonCenterDiscovery();
    return res.redirect(`/dashboard?flash=success&message=Pokemon%20Center%20discovery%20saved%20${count}%20urls`);
  } catch (err) {
    console.error("Pokemon Center discovery failed:", err);
    return res.redirect("/dashboard?flash=error&message=Pokemon%20Center%20discovery%20failed");
  }
});

app.post("/pokemoncenter/monitor/run", requireAuth, async (req, res) => {
  try {
    await runPokemonCenterMonitorCycle();
    return res.redirect("/dashboard?flash=success&message=Pokemon%20Center%20monitor%20completed");
  } catch (err) {
    console.error("Pokemon Center monitor failed:", err);
    return res.redirect("/dashboard?flash=error&message=Pokemon%20Center%20monitor%20failed");
  }
});

app.post("/pokemoncenter/digest/send", requireAuth, async (_req, res) => {
  try {
    await sendPokemonCenterDigest();
    return res.redirect("/dashboard?flash=success&message=Pokemon%20Center%206-hour%20digest%20sent");
  } catch (err) {
    console.error("Pokemon Center digest failed:", err);
    return res.redirect("/dashboard?flash=error&message=Pokemon%20Center%20digest%20failed");
  }
});

app.get("/pokemoncenter/feed", requireAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT e.created_at, p.canonical_name, po.product_url, e.old_state, e.new_state, e.old_price, e.new_price
    FROM events e
    JOIN product_offers po ON po.id = e.product_offer_id
    JOIN products p ON p.id = po.product_id
    JOIN retailers r ON r.id = po.retailer_id
    WHERE r.adapter_key = 'pokemoncenter'
    ORDER BY e.created_at DESC
    LIMIT 100
  `).all();
  return res.json({ rows });
});

app.post("/retail/offers/add", requireAuth, (req, res) => {
  try {
    const retailerKey = String(req.body.retailer_key || "").trim().toLowerCase();
    const name = String(req.body.name || "").trim();
    const productUrl = String(req.body.product_url || "").trim();
    const retailerSku = String(req.body.retailer_sku || "").trim();
    if (!["bestbuy", "target", "walmart", "gamestop"].includes(retailerKey)) {
      return res.redirect("/dashboard?flash=error&message=Unsupported%20retailer%20key");
    }
    if (!name || !productUrl) {
      return res.redirect("/dashboard?flash=error&message=Retail%20offer%20name%20and%20URL%20are%20required");
    }
    ensureProductAndOffer(productUrl, name, null, STATES.LISTED, retailerKey, { retailerSku });
    return res.redirect("/dashboard?flash=success&message=Retail%20offer%20added");
  } catch (err) {
    console.error("Retail offer add failed:", err);
    return res.redirect("/dashboard?flash=error&message=Retail%20offer%20add%20failed");
  }
});

app.post("/retail/monitor/run", requireAuth, async (_req, res) => {
  try {
    await runMajorRetailMonitorCycle();
    return res.redirect("/dashboard?flash=success&message=Major%20retail%20monitor%20completed");
  } catch (err) {
    console.error("Major retail monitor failed:", err);
    return res.redirect("/dashboard?flash=error&message=Major%20retail%20monitor%20failed");
  }
});

app.get("/retail/feed", requireAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT e.created_at, r.name AS retailer_name, p.canonical_name, po.product_url, e.old_state, e.new_state, e.old_price, e.new_price
    FROM events e
    JOIN product_offers po ON po.id = e.product_offer_id
    JOIN products p ON p.id = po.product_id
    JOIN retailers r ON r.id = po.retailer_id
    WHERE r.adapter_key IN ('bestbuy','target','walmart','gamestop')
    ORDER BY e.created_at DESC
    LIMIT 100
  `).all();
  return res.json({ rows });
});

app.post("/market/snapshot", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  if (user.role !== "owner") {
    return res.status(403).send("Forbidden");
  }

  const productName = String(req.body.product_name || "").trim();
  const sourceName = String(req.body.source_name || "").trim();
  const priceRaw = String(req.body.price || "").trim();
  const url = String(req.body.url || "").trim();
  const price = priceRaw ? Number(priceRaw) : null;
  if (!productName || !sourceName) {
    return res.redirect("/dashboard?flash=error&message=Market%20snapshot%20requires%20product%20and%20source");
  }

  db.prepare(`
    INSERT INTO market_snapshots (product_name, source_name, price, url)
    VALUES (?, ?, ?, ?)
  `).run(productName, sourceName, Number.isFinite(price) ? price : null, url || null);

  return res.redirect("/dashboard?flash=success&message=Market%20snapshot%20saved");
});

app.get("/api/public/feed", (_req, res) => {
  const events = db.prepare(`
    SELECT e.created_at, r.name AS retailer, p.canonical_name, po.product_url, e.new_state, e.new_price
    FROM events e
    JOIN product_offers po ON po.id = e.product_offer_id
    JOIN products p ON p.id = po.product_id
    JOIN retailers r ON r.id = po.retailer_id
    ORDER BY e.created_at DESC
    LIMIT 50
  `).all();
  return res.json({ events, generated_at: new Date().toISOString() });
});

app.get("/calendar", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const rows = db.prepare(`
    SELECT *
    FROM release_calendar
    ORDER BY release_date ASC
    LIMIT 200
  `).all();

  const items = rows.length
    ? rows.map((item) => `
      <tr>
        <td>${escapeHtml(item.release_date)}</td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.set_name || "")}</td>
        <td>${escapeHtml(item.notes || "")}</td>
        <td>${item.source_url ? `<a href="${item.source_url}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="muted">No release calendar entries yet.</td></tr>`;

  const ownerForm = user.role === "owner" ? `
    <div class="card">
      <h2>Add release</h2>
      <form method="post" action="/calendar/add">
        <label>Title</label><input name="title" required />
        <label style="margin-top:12px; display:block;">Set name</label><input name="set_name" />
        <label style="margin-top:12px; display:block;">Release date</label><input type="date" name="release_date" required />
        <label style="margin-top:12px; display:block;">Source URL</label><input type="url" name="source_url" />
        <label style="margin-top:12px; display:block;">Notes</label><textarea name="notes"></textarea>
        <div style="margin-top:12px;"><button>Add release</button></div>
      </form>
    </div>
  ` : "";

  const body = `
    ${ownerForm}
    <div class="card">
      <h2>Release calendar</h2>
      <table>
        <thead><tr><th>Date</th><th>Title</th><th>Set</th><th>Notes</th><th>Source</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
      <div style="margin-top:12px;"><a href="/dashboard"><button>Back to dashboard</button></a></div>
    </div>
  `;

  return res.send(renderPage("Release Calendar", body, user));
});

app.post("/calendar/add", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  if (user.role !== "owner") {
    return res.status(403).send("Forbidden");
  }

  const title = String(req.body.title || "").trim();
  const setName = String(req.body.set_name || "").trim();
  const releaseDate = String(req.body.release_date || "").trim();
  const sourceUrl = String(req.body.source_url || "").trim();
  const notes = String(req.body.notes || "").trim();
  if (!title || !releaseDate) {
    return res.redirect("/calendar");
  }

  db.prepare(`
    INSERT INTO release_calendar (title, set_name, release_date, notes, source_url, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, setName || null, releaseDate, notes || null, sourceUrl || null, user.id);

  return res.redirect("/calendar");
});

app.get("/health/dashboard", requireAuth, (req, res) => {
  const user = ownerOverride(getUserById(req.auth.sub));
  const runs = db.prepare(`
    SELECT adapter_key, status, started_at, finished_at, requests_made, errors_count,
           ROUND((julianday(finished_at) - julianday(started_at)) * 86400000) AS duration_ms
    FROM monitor_runs
    ORDER BY started_at DESC
    LIMIT 100
  `).all();
  const stats = db.prepare(`
    SELECT COUNT(*) AS total_runs,
           SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_runs,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS failed_runs,
           AVG(CASE WHEN finished_at IS NOT NULL THEN (julianday(finished_at) - julianday(started_at)) * 86400000 END) AS avg_duration_ms
    FROM monitor_runs
  `).get();

  const rows = runs.length
    ? runs.map((run) => `<tr><td>${escapeHtml(run.adapter_key)}</td><td>${escapeHtml(run.status)}</td><td>${escapeHtml(run.started_at)}</td><td>${run.duration_ms || ""}</td><td>${run.requests_made}</td><td>${run.errors_count}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">No monitor runs recorded yet.</td></tr>`;

  const body = `
    <div class="card">
      <h2>Health dashboard</h2>
      <p>Total runs: ${stats.total_runs || 0}</p>
      <p>OK runs: ${stats.ok_runs || 0}</p>
      <p>Failed runs: ${stats.failed_runs || 0}</p>
      <p>Average duration: ${stats.avg_duration_ms ? Math.round(stats.avg_duration_ms) : 0} ms</p>
      <table>
        <thead><tr><th>Adapter</th><th>Status</th><th>Started</th><th>Duration ms</th><th>Requests</th><th>Errors</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;"><a href="/dashboard"><button>Back to dashboard</button></a></div>
    </div>
  `;

  return res.send(renderPage("Health Dashboard", body, user));
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

function startSchedulers() {
  if (AUTO_SCAN_ENABLED) {
    setInterval(async () => {
      try {
        await runAutomatedScan(null, { targetOnly: true });
      } catch (err) {
        console.error("Automated scan failed:", err);
      } finally {
        if (AUTO_SEND_TARGET_UPDATES) {
          await sendAutomatedTargetUpdates();
        }
      }
    }, AUTO_SCAN_INTERVAL_MS);
  }

  if (POKEMON_CENTER_MONITOR_ENABLED) {
    setInterval(async () => {
      try {
        await runPokemonCenterMonitorCycle();
      } catch (err) {
        console.error("Pokemon Center automated monitor failed:", err);
      }
    }, POKEMON_CENTER_MONITOR_INTERVAL_MS);

    setInterval(async () => {
      try {
        await sendPokemonCenterDigest();
      } catch (err) {
        console.error("Pokemon Center automated digest failed:", err);
      }
    }, POKEMON_CENTER_DIGEST_INTERVAL_MS);
  }

  if (MAJOR_RETAIL_MONITOR_ENABLED) {
    setInterval(async () => {
      try {
        await runMajorRetailMonitorCycle();
      } catch (err) {
        console.error("Major retail automated monitor failed:", err);
      }
    }, MAJOR_RETAIL_MONITOR_INTERVAL_MS);
  }
}

function logStartupConfig() {
  console.log(`Pokemon Alerts SaaS running on ${APP_URL}`);
  if (AUTO_SCAN_ENABLED) {
    console.log(`Automated scans enabled every ${AUTO_SCAN_INTERVAL_MS}ms`);
    console.log(`Automated Target updates every interval: ${AUTO_SEND_TARGET_UPDATES ? "on" : "off"}`);
  } else {
    console.log("Automated scans disabled");
  }
  if (POKEMON_CENTER_MONITOR_ENABLED) {
    console.log(`Pokemon Center monitor enabled every ${POKEMON_CENTER_MONITOR_INTERVAL_MS}ms`);
    console.log(`Pokemon Center digest enabled every ${POKEMON_CENTER_DIGEST_INTERVAL_MS}ms`);
  } else {
    console.log("Pokemon Center monitor disabled");
  }
  if (MAJOR_RETAIL_MONITOR_ENABLED) {
    console.log(`Major retail monitor enabled every ${MAJOR_RETAIL_MONITOR_INTERVAL_MS}ms`);
  } else {
    console.log("Major retail monitor disabled");
  }
}

module.exports = {
  app,
  db,
  constants: {
    PORT,
    APP_URL,
    AUTO_SCAN_ENABLED,
    AUTO_SCAN_INTERVAL_MS,
    AUTO_SEND_TARGET_UPDATES,
    POKEMON_CENTER_MONITOR_ENABLED,
    POKEMON_CENTER_MONITOR_INTERVAL_MS,
    POKEMON_CENTER_DIGEST_INTERVAL_MS,
    MAJOR_RETAIL_MONITOR_ENABLED,
    MAJOR_RETAIL_MONITOR_INTERVAL_MS
  },
  startSchedulers,
  logStartupConfig,
  tasks: {
    runAutomatedScan,
    runPokemonCenterDiscovery,
    runPokemonCenterMonitorCycle,
    runMajorRetailMonitorCycle,
    sendPokemonCenterDigest,
    sendTarget24hUpdate,
    sendAutomatedTargetUpdates
  }
};
