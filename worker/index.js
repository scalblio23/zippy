import express from "express";
import { chromium } from "playwright-core";
import { accessSync } from "fs";

const app = express();
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

// Availability endpoint — fetches real slots from Calendly's internal API
app.get("/availability", async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Missing startDate or endDate query params" });
  }
  try {
    const url = `https://calendly.com/api/booking/event_types/zippyfinancial/45min/calendar/range` +
      `?timezone=Australia%2FSydney&diagnostics=false&range_start=${startDate}&range_end=${endDate}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ZippyBot/1.0)",
        "Accept": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Calendly API returned ${response.status}`);
    const data = await response.json();
    const days = (data.days ?? [])
      .filter(d => d.status === "available")
      .map(d => ({
        date: d.date,
        slots: d.spots.map(s => {
          const t = new Date(s.start_time);
          const h = t.getUTCHours().toString().padStart(2, "0");
          const m = t.getUTCMinutes().toString().padStart(2, "0");
          return `${h}:${m}`;
        }),
      }));
    res.json(days);
  } catch (err) {
    console.error("[Worker] Availability fetch failed:", err.message);
    res.status(500).json({ error: err.message });
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
