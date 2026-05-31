import { chromium } from "playwright-core";

const CALENDLY_USER = "zippyfinancial";
const CALENDLY_EVENT = "45min";
const CALENDLY_BASE = `https://calendly.com/${CALENDLY_USER}/${CALENDLY_EVENT}`;
const TIMEZONE = "Australia/Sydney";

// ── Available Slots ───────────────────────────────────────────────────────────
// Uses Calendly's internal booking API (no browser needed)

export interface CalendlyDay {
  date: string; // YYYY-MM-DD
  slots: string[]; // "HH:MM" in 24h format
}

export async function getCalendlyAvailability(
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<CalendlyDay[]> {
  const url =
    `https://calendly.com/api/booking/event_types/${CALENDLY_USER}/${CALENDLY_EVENT}/calendar/range` +
    `?timezone=${encodeURIComponent(TIMEZONE)}&diagnostics=false` +
    `&range_start=${startDate}&range_end=${endDate}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ZippyBot/1.0)",
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`Calendly availability fetch failed: ${res.status}`);

  const data = await res.json() as {
    days: Array<{ date: string; status: string; spots: Array<{ start_time: string }> }>;
  };

  return data.days
    .filter(d => d.status === "available")
    .map(d => ({
      date: d.date,
      slots: d.spots.map(s => {
        // start_time is an ISO string — extract HH:MM
        const t = new Date(s.start_time);
        const h = t.getHours().toString().padStart(2, "0");
        const m = t.getMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
      }),
    }));
}

// ── Book a Slot ───────────────────────────────────────────────────────────────
// Uses Playwright headless Chromium to navigate and complete the booking

export interface BookingDetails {
  name: string;
  email: string;
  phone?: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:MM (24h, Sydney time)
}

export async function bookCalendlySlot(details: BookingDetails): Promise<void> {
  // Find chromium executable — check common paths for nixpacks/system installs
  const executablePath = findChromium();

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

    // Navigate directly to the date URL
    await page.goto(`${CALENDLY_BASE}/${details.date}`, { waitUntil: "networkidle" });

    // Format time for matching — Calendly shows times like "9:00am" or "9:30am"
    const [hh, mm] = details.time.split(":").map(Number);
    const ampm = hh >= 12 ? "pm" : "am";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const timeLabel = `${h12}:${mm.toString().padStart(2, "0")}${ampm}`;

    // Click the matching time slot button
    const slotButton = page.locator(`button:has-text("${timeLabel}")`).first();
    await slotButton.waitFor({ state: "visible" });
    await slotButton.click();

    // Click "Next" to proceed to details form
    const nextButton = page.locator('button:has-text("Next")').first();
    await nextButton.waitFor({ state: "visible" });
    await nextButton.click();

    // Fill in name
    await page.locator('input[name="full_name"]').fill(details.name);

    // Fill in email
    await page.locator('input[name="email"]').fill(details.email);

    // Fill phone if the field exists
    if (details.phone) {
      const phoneField = page.locator('input[name="phone_number"], input[placeholder*="phone" i]').first();
      const exists = await phoneField.count();
      if (exists) await phoneField.fill(details.phone);
    }

    // Submit the booking
    const scheduleButton = page.locator('button:has-text("Schedule Event"), button[type="submit"]').first();
    await scheduleButton.waitFor({ state: "visible" });
    await scheduleButton.click();

    // Wait for confirmation page
    await page.waitForURL(/confirmation|scheduled/i, { timeout: 20_000 });

    console.log(`[Calendly] Booked ${details.date} ${details.time} for ${details.name}`);
  } finally {
    await browser.close();
  }
}

function findChromium(): string | undefined {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/run/current-system/sw/bin/chromium",
  ];
  for (const p of candidates) {
    if (!p) continue;
    try {
      require("fs").accessSync(p);
      return p;
    } catch {}
  }
  return undefined; // let Playwright try to find it itself
}
