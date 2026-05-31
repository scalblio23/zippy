import express from "express";
import { chromium } from "playwright-core";
import { accessSync } from "fs";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json());

const CALENDLY_BASE = "https://calendly.com/zippyfinancial/45min";

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const p of candidates) {
    if (!p) continue;
    try {
      accessSync(p);
      return p;
    } catch {}
  }
  return undefined;
}

async function bookCalendly({ name, email, phone, date, time }) {
  const executablePath = findChromium();
  console.log(`[Worker] Booking ${name} on ${date} at ${time}, chromium: ${executablePath}`);

  const browser = await chromium.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--headless=new",
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    // Navigate to the specific date
    await page.goto(`${CALENDLY_BASE}/${date}`, { waitUntil: "networkidle" });

    // Format time for matching e.g. "9:00am"
    const [hh, mm] = time.split(":").map(Number);
    const ampm = hh >= 12 ? "pm" : "am";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const timeLabel = `${h12}:${mm.toString().padStart(2, "0")}${ampm}`;

    // Click matching time slot
    const slotButton = page.locator(`button:has-text("${timeLabel}")`).first();
    await slotButton.waitFor({ state: "visible" });
    await slotButton.click();

    // Click Next
    const nextButton = page.locator('button:has-text("Next")').first();
    await nextButton.waitFor({ state: "visible" });
    await nextButton.click();

    // Fill name
    await page.locator('input[name="full_name"]').fill(name);

    // Fill email
    await page.locator('input[name="email"]').fill(email);

    // Fill phone if field exists
    if (phone) {
      const phoneField = page.locator('input[name="phone_number"], input[placeholder*="phone" i]').first();
      if (await phoneField.count()) await phoneField.fill(phone);
    }

    // Submit
    const scheduleButton = page.locator('button:has-text("Schedule Event"), button[type="submit"]').first();
    await scheduleButton.waitFor({ state: "visible" });
    await scheduleButton.click();

    // Wait for confirmation
    await page.waitForURL(/confirmation|scheduled/i, { timeout: 20_000 });

    console.log(`[Worker] Booking confirmed for ${name} on ${date} at ${time}`);
  } finally {
    await browser.close();
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", chromium: findChromium() ?? "not found" });
});

// Debug endpoint — returns raw JSON from Calendly's calendar/range API call
app.get("/debug-availability", async (req, res) => {
  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--headless=new"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    let rawData = null;
    page.on("response", async response => {
      const url = response.url();
      if (url.includes("calendar/range")) {
        try { rawData = await response.json(); } catch {}
      }
    });
    await page.goto("https://calendly.com/zippyfinancial/45min", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    res.json(rawData ?? { error: "No calendar/range response captured" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
});

// Availability endpoint — scrapes available dates+times from Calendly via headless Chromium
app.get("/availability", async (req, res) => {
  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--headless=new"],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    // Intercept Calendly's own API calls to grab availability data
    const availabilityData = [];
    const capturedUrls = [];
    page.on("response", async response => {
      const url = response.url();
      capturedUrls.push(url);
      // Broad match — Calendly has used several API path patterns
      if (
        url.includes("calendar/range") ||
        url.includes("date_range") ||
        url.includes("availability") ||
        url.includes("/days") ||
        url.includes("booking/ranges") ||
        url.includes("event_type") && url.includes("available")
      ) {
        try {
          const json = await response.json();
          if (json.days) availabilityData.push(...json.days);
          else if (Array.isArray(json)) availabilityData.push(...json);
        } catch {}
      }
    });

    await page.goto("https://calendly.com/zippyfinancial/45min", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    console.log(`[Worker] Captured ${capturedUrls.length} URLs from Calendly page`);
    capturedUrls.forEach(u => console.log("[Worker] URL:", u));

    const days = availabilityData
      .filter(d => d.status === "available")
      .map(d => ({
        date: d.date,
        slots: (d.spots ?? []).map(s => {
          const t = new Date(s.start_time);
          const h = t.getUTCHours().toString().padStart(2, "0");
          const m = t.getUTCMinutes().toString().padStart(2, "0");
          return `${h}:${m}`;
        }),
      }))
      .filter(d => d.slots.length > 0);

    console.log(`[Worker] Scraped ${days.length} available days`);
    res.json(days);
  } catch (err) {
    console.error("[Worker] Availability scrape failed:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
});

// Book endpoint
app.post("/book", async (req, res) => {
  const { name, email, phone, date, time } = req.body;

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: "Missing required fields: name, email, date, time" });
  }

  // Respond immediately — booking happens async
  res.json({ status: "queued", message: "Booking in progress" });

  try {
    await bookCalendly({ name, email, phone, date, time });
  } catch (err) {
    console.error("[Worker] Booking failed:", err.message);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[Worker] Calendly booking worker running on port ${PORT}`);
  console.log(`[Worker] Chromium path: ${findChromium() ?? "not found"}`);
});
