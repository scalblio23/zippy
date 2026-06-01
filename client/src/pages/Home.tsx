/**
 * DESIGN: Bold Conversion-Focused Survey — King Kong style
 * Palette: Light grey bg (#F0F0EE), Dark Teal (#0D5C55), Teal CTA (#0D9E8F)
 * Fonts: Barlow Condensed 900 (headlines), DM Sans (body/UI)
 *
 * Flow: Intro → Name → Bank → Loan → Interest → Timeline → Contact → Analysing (AI) → Report Ready → Book Call
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { trackSurveyStep, trackLead, trackBooking } from "@/lib/pixel";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Check, Phone, Mail, Calendar,
  ArrowRight, Star, ChevronRight as ChevronRightIcon,
  TrendingDown, FileText, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { BrokerReport, LenderOption } from "../../../server/routers";

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Bank data ─────────────────────────────────────────────────────────────────
const BANKS = [
  { id: "anz",       name: "ANZ",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/anz-logo_a7096508.png" },
  { id: "cba",       name: "Commonwealth Bank", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/cba-logo_256a1ba4.png" },
  { id: "westpac",   name: "Westpac",           logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/westpac-logo_9bddfc0e.png" },
  { id: "nab",       name: "NAB",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/nab-logo_da9dc348.png" },
  { id: "ing",       name: "ING",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/ing-logo_beb42b4f.png" },
  { id: "macquarie", name: "Macquarie",         logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/macquarie-logo_92d536eb.png" },
  { id: "stgeorge",  name: "St. George",        logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/stgeorge-logo_b84fdece.png" },
  { id: "suncorp",   name: "Suncorp",           logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/suncorp-logo_dfaee248.jpg" },
  { id: "bendigo",   name: "Bendigo Bank",      logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/bendigo-logo_f206e6d1.png" },
  { id: "other",     name: "Other",             logo: "" },
];

const LOAN_SIZES = [
  "Under $250,000", "$250,000 – $500,000", "$500,000 – $750,000",
  "$750,000 – $1,000,000", "Over $1,000,000",
];

const INTEREST_RANGES = [
  "Under 5%", "5% – 5.5%", "5.5% – 6%", "6% – 6.5%", "6.5% – 7%", "Over 7%",
];

const TIMELINES = [
  { emoji: "😴", level: "Low", desc: "I don't mind paying my current rate", value: "Low", color: "#EF4444" },
  { emoji: "😐", level: "Medium", desc: "I'd like to see what rates are available", value: "Medium", color: "#F97316" },
  { emoji: "💪", level: "High", desc: "I really want to avoid paying extra interest", value: "High", color: "#22C55E" },
];

const TIME_SLOTS = [
  "9:00 AM – 9:30 AM", "9:30 AM – 10:00 AM", "10:00 AM – 10:30 AM",
  "10:30 AM – 11:00 AM", "11:00 AM – 11:30 AM", "1:00 PM – 1:30 PM",
  "1:30 PM – 2:00 PM", "2:00 PM – 2:30 PM", "3:00 PM – 3:30 PM", "4:00 PM – 4:30 PM",
];

// AI analysis steps shown live to user
const AI_STEPS = [
  { text: "Analysing your current rate...", icon: "🔍" },
  { text: "Searching 30+ Australian lenders...", icon: "🏦" },
  { text: "Comparing variable & fixed rates...", icon: "📊" },
  { text: "Calculating potential savings...", icon: "💰" },
  { text: "Generating your personalised report...", icon: "📋" },
];

const RATE_MESSAGES: Record<string, { style: "success" | "caution"; emoji: string; headline: string; body: string }> = {
  "Under 5%":    { style: "caution", emoji: "🤔", headline: "We may be able to help",         body: "Your rate is already quite competitive, but there may still be savings or better features available. Your broker will walk you through what's possible on your call." },
  "5% – 5.5%":  { style: "success", emoji: "👀", headline: "There could be room to move",    body: "Rates in your range have been shifting. There's a good chance we can find you something sharper — your broker will share specific options on your call." },
  "5.5% – 6%":  { style: "success", emoji: "💡", headline: "Good news — we can likely do better", body: "At 5.5–6%, you're paying more than you need to. We've identified lenders who could do better — your broker will walk you through exactly how much you could save." },
  "6% – 6.5%":  { style: "success", emoji: "🎯", headline: "We can probably get you a better deal", body: "A rate of 6–6.5% is above what most lenders are offering right now. Your broker will talk you through the savings on the table when they call." },
  "6.5% – 7%":  { style: "success", emoji: "🔥", headline: "Big savings on the table",        body: "At 6.5–7%, you're significantly above market rates. Multiple lenders could do better for you — your broker will go through the numbers with you on your call." },
  "Over 7%":    { style: "success", emoji: "🚨", headline: "You're paying way too much",       body: "Over 7% is well above what's available in today's market. There are lenders who can cut your repayments meaningfully — your broker will run through the options on your call." },
};

const TOTAL_STEPS = 7;

// ── Timezones ─────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { label: "AEST – Sydney / Melbourne (UTC+10)", tz: "Australia/Sydney", offsetHours: 10 },
  { label: "AEDT – Sydney / Melbourne (UTC+11)", tz: "Australia/Sydney", offsetHours: 11 },
  { label: "ACST – Adelaide / Darwin (UTC+9:30)", tz: "Australia/Adelaide", offsetHours: 9.5 },
  { label: "AWST – Perth (UTC+8)", tz: "Australia/Perth", offsetHours: 8 },
  { label: "NZST – New Zealand (UTC+12)", tz: "Pacific/Auckland", offsetHours: 12 },
  { label: "SGT – Singapore (UTC+8)", tz: "Asia/Singapore", offsetHours: 8 },
  { label: "IST – India (UTC+5:30)", tz: "Asia/Kolkata", offsetHours: 5.5 },
  { label: "GMT – London (UTC+0)", tz: "Europe/London", offsetHours: 0 },
  { label: "EST – New York (UTC-5)", tz: "America/New_York", offsetHours: -5 },
  { label: "PST – Los Angeles (UTC-8)", tz: "America/Los_Angeles", offsetHours: -8 },
];
function detectTimezone(): string {
  try {
    const ianaName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    const match = TIMEZONES.find(t => t.tz === ianaName && t.offsetHours === offsetHours);
    if (match) return `${match.tz}|${match.offsetHours}`;
  } catch {}
  return "Australia/Sydney|10";
}
function convertSlotToTimezone(slot: string, targetOffsetHours: number): string {
  const BASE_OFFSET = 10; // AEST UTC+10
  const diff = targetOffsetHours - BASE_OFFSET;
  if (diff === 0) return slot;
  const convertTime = (timeStr: string): string => {
    const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!match) return timeStr;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const totalMins = h * 60 + m + Math.round(diff * 60);
    let newH = Math.floor(((totalMins % 1440) + 1440) % 1440 / 60);
    const newM = ((totalMins % 60) + 60) % 60;
    const newAmpm = newH >= 12 ? "PM" : "AM";
    if (newH > 12) newH -= 12;
    if (newH === 0) newH = 12;
    return `${newH}:${String(newM).padStart(2, "0")} ${newAmpm}`;
  };
  const parts = slot.split("–").map(s => s.trim());
  if (parts.length === 2) return `${convertTime(parts[0])} – ${convertTime(parts[1])}`;
  return convertTime(slot);
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function getNext2AvailableDays(blockedDayKeys: Set<string>, blockedSlotKeys?: Set<string>): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  let scanned = 0;
  while (days.length < 2 && scanned < 14) {
    const key = d.toISOString().slice(0, 10);
    if (!blockedDayKeys.has(key)) {
      // Also skip if every available time slot is individually blocked
      if (blockedSlotKeys) {
        const allSlotsBlocked = TIME_SLOTS.every(slot => {
          const slotHour = slot.split(":")[0].padStart(2, "0") + ":00";
          return blockedSlotKeys.has(`${key}|${slotHour}`);
        });
        if (!allSlotsBlocked) days.push(new Date(d));
      } else {
        days.push(new Date(d));
      }
    }
    d.setDate(d.getDate() + 1);
    scanned++;
  }
  return days;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// Map a TIME_SLOT label (AEST, e.g. "1:00 PM – 1:30 PM") to its hour-bucket
// block key ("13:00"). Admin blocks at hour granularity so both half-hours
// inside an hour share the same block key.
function slotToBlockKey(slot: string): string {
  const start = slot.split("–")[0].trim();
  const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:00`;
}

function isSlotBlocked(
  date: Date | null,
  slot: string,
  blockedDayKeys: Set<string>,
  blockedSlotKeys: Set<string>,
): boolean {
  if (!date) return false;
  const dateKey = date.toISOString().slice(0, 10);
  if (blockedDayKeys.has(dateKey)) return true;
  const hourKey = slotToBlockKey(slot);
  return hourKey ? blockedSlotKeys.has(`${dateKey}|${hourKey}`) : false;
}

// ── Calendar helpers ──────────────────────────────────────────────────────────
// All booking slots are defined in AEST. Each helper below converts that to a
// platform-appropriate format so users can add the event regardless of which
// calendar app they use.
const AEST_OFFSET_HOURS = 10;
const CAL_EVENT_TITLE = "Refinance call with Finchecker";

function buildCalEventTimes(date: Date, slot: string): { startUtc: Date; endUtc: Date } {
  const parseSlotStartAEST = (s: string): { hour: number; minute: number } => {
    const start = s.split("–")[0].trim();
    const m = start.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    if (!m) return { hour: 9, minute: 0 };
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return { hour: h, minute: min };
  };

  const { hour: hAEST, minute } = parseSlotStartAEST(slot);
  // AEST = UTC + 10, so subtract 10h to express the slot start in UTC.
  const startUtc = new Date(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    hAEST - AEST_OFFSET_HOURS, minute, 0,
  ));
  const endUtc = new Date(startUtc.getTime() + 30 * 60 * 1000);
  return { startUtc, endUtc };
}

// Compact UTC stamp used by both .ics (DTSTART) and Google Calendar URL.
function formatCalUtcStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString().padStart(4, "0") +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

function buildCalDescription(name: string, phone: string): string {
  return `A broker will call ${name} on ${phone} to walk through refinance options and potential savings.\n\nTip: have your most recent home loan statement handy if you can — it helps us give you accurate numbers on the call.`;
}

// ── 1) ICS file (Apple Calendar, Outlook desktop, generic fallback) ───────────
function buildIcsFile(args: { date: Date; slot: string; name: string; phone: string }): string {
  const { startUtc, endUtc } = buildCalEventTimes(args.date, args.slot);
  // RFC-5545 text escape: backslash, comma, semicolon, newlines.
  const esc = (s: string): string =>
    s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@finchecker`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finchecker//Refinance Call//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatCalUtcStamp(new Date())}`,
    `DTSTART:${formatCalUtcStamp(startUtc)}`,
    `DTEND:${formatCalUtcStamp(endUtc)}`,
    `SUMMARY:${esc(CAL_EVENT_TITLE)}`,
    `DESCRIPTION:${esc(buildCalDescription(args.name, args.phone))}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Refinance call in 15 minutes")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n"); // RFC-5545 requires CRLF line endings.
}

function downloadIcsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 2) Google Calendar — opens a pre-filled compose tab ───────────────────────
function buildGoogleCalendarUrl(args: { date: Date; slot: string; name: string; phone: string }): string {
  const { startUtc, endUtc } = buildCalEventTimes(args.date, args.slot);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: CAL_EVENT_TITLE,
    dates: `${formatCalUtcStamp(startUtc)}/${formatCalUtcStamp(endUtc)}`,
    details: buildCalDescription(args.name, args.phone),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── 3) Outlook (web/Microsoft 365) — opens a pre-filled compose page ──────────
// Uses ISO-8601 with Z suffix; Outlook accepts UTC times and shows them in the
// user's local timezone automatically.
function buildOutlookCalendarUrl(args: { date: Date; slot: string; name: string; phone: string }): string {
  const { startUtc, endUtc } = buildCalEventTimes(args.date, args.slot);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: CAL_EVENT_TITLE,
    startdt: startUtc.toISOString().replace(/\.\d{3}Z$/, "Z"),
    enddt: endUtc.toISOString().replace(/\.\d{3}Z$/, "Z"),
    body: buildCalDescription(args.name, args.phone),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// ── Slide variants ────────────────────────────────────────────────────────────
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};
const transition = { duration: 0.3 };

const revealVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

interface FormData {
  name: string;
  bank: string;
  phone: string;
  email: string;
  loanSize: string;
  interest: string;
  timeline: string;
  bookingDate: Date | null;
  bookingTime: string;
  bookingTimezone: string;
  bookingConfirmed: boolean;
  timezone: string;
}

// ── Bouncing Arrow Prompt ─────────────────────────────────────────────────────
function BouncingArrow() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-1.5 mt-3 ml-1"
    >
      <motion.div
        animate={{ x: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }}
      >
        <ArrowRight className="w-4 h-4 text-[#0D9E8F]" strokeWidth={2.5} />
      </motion.div>
      <span className="text-xs font-medium text-[#0D9E8F]">Fill this in to continue</span>
    </motion.div>
  );
}

// ── Connected Dot Progress Bar ────────────────────────────────────────────────
function DotProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {Array.from({ length: total }).map((_, i) => {
        const isCompleted = i + 1 < step;
        const isActive    = i + 1 === step;
        return (
          <div key={i} className="flex items-center">
            <motion.div
              animate={{
                backgroundColor: isCompleted || isActive ? "#0D5C55" : "#D1D5DB",
                scale: isActive ? 1.25 : 1,
              }}
              transition={{ duration: 0.3 }}
              className="w-3.5 h-3.5 rounded-full z-10 relative flex-shrink-0"
              style={{ boxShadow: isActive ? "0 0 0 4px rgba(13,92,85,0.18)" : "none" }}
            />
            {i < total - 1 && (
              <div className="w-6 sm:w-10 h-0.5 flex-shrink-0 relative overflow-hidden bg-gray-200">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-[#0D5C55]"
                  animate={{ width: isCompleted ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Brand Header ──────────────────────────────────────────────────────────────
function BrandHeader() {
  return (
    <header className="w-full flex justify-center pt-5 pb-2">
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/finchecker-logo-nobg_fd93207b.png"
        alt="Finchecker"
        className="h-11 w-auto object-contain"
      />
    </header>
  );
}

// ── Compliance Footer ─────────────────────────────────────────────────────────
const TRUST_BANK_LOGOS = [
  { name: "ANZ",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/anz-logo_a7096508.png" },
  { name: "Commonwealth Bank", logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/cba-logo_256a1ba4.png" },
  { name: "Westpac",           logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/westpac-logo_9bddfc0e.png" },
  { name: "NAB",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/nab-logo_da9dc348.png" },
  { name: "ING",               logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/ing-logo_beb42b4f.png" },
  { name: "Macquarie",         logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/macquarie-logo_92d536eb.png" },
  { name: "St. George",        logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/stgeorge-logo_b84fdece.png" },
  { name: "Suncorp",           logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/suncorp-logo_dfaee248.jpg" },
  { name: "Bendigo Bank",      logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/bendigo-logo_f206e6d1.png" },
];

function ComplianceFooter() {
  return (
    <footer className="w-full bg-white border-t border-gray-100 mt-auto">
      {/* Lenders we compare */}
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-4">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 text-center mb-4">Lenders We Compare</p>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6">
          {TRUST_BANK_LOGOS.map(b => (
            <img key={b.name} src={b.logo} alt={b.name} className="h-6 w-auto object-contain opacity-50 grayscale hover:opacity-80 hover:grayscale-0 transition-all duration-200" />
          ))}
        </div>
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-[10px] text-gray-400 leading-relaxed text-center">
            <strong className="text-gray-500">General Information Only.</strong> Finchecker is a home loan comparison service, not a financial product provider, credit provider, or financial adviser. We do not hold an Australian Credit Licence (ACL) or Australian Financial Services Licence (AFSL). The information on this website is general in nature and does not take into account your personal financial situation, objectives, or needs. It should not be relied upon as financial, legal, or credit advice.
          </p>
          <p className="text-[10px] text-gray-400 leading-relaxed text-center">
            Finchecker compares a select range of home loan products from participating lenders. We may receive a referral fee from lenders when you connect with them through our service. This does not affect the objectivity of our comparisons. Always consider the Product Disclosure Statement (PDS) and Target Market Determination (TMD) before making any financial decision. Past rates are not indicative of future rates.
          </p>
          <p className="text-[10px] text-gray-400 text-center mt-2">
            © {new Date().getFullYear()} Finchecker. All rights reserved. | <a href="#" className="underline hover:text-gray-600">Privacy Policy</a> | <a href="#" className="underline hover:text-gray-600">Terms of Use</a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── Bank Card ─────────────────────────────────────────────────────────────────
function BankCard({ bank, selected, onClick }: { bank: (typeof BANKS)[0]; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(13,92,85,0.15)" }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 bg-white
        ${selected ? "border-[#0D5C55] shadow-md" : "border-gray-100 hover:border-gray-200"}`}
    >
      {selected && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#0D5C55] flex items-center justify-center">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </motion.div>
      )}
      {bank.logo ? (
        <div className="w-full h-10 flex items-center justify-center">
          <img src={bank.logo} alt={bank.name} className="max-h-10 max-w-full object-contain" />
        </div>
      ) : (
        <div className="w-full h-10 flex items-center justify-center">
          <span className="text-sm font-semibold text-gray-400">Other</span>
        </div>
      )}
      <span className="text-xs font-medium text-gray-400 text-center leading-tight">{bank.name}</span>
    </motion.button>
  );
}

// ── Option Pill ───────────────────────────────────────────────────────────────
function OptionPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`w-full text-left px-5 py-3.5 rounded-xl border-2 font-medium text-sm transition-all duration-200
        ${selected
          ? "border-[#0D5C55] bg-[#0D5C55]/5 text-[#0D5C55]"
          : "border-gray-100 bg-white text-gray-700 hover:border-gray-200"
        }`}
    >
      <div className="flex items-center justify-between">
        <span>{label}</span>
        {selected && <Check className="w-4 h-4 text-[#0D5C55]" strokeWidth={2.5} />}
      </div>
    </motion.button>
  );
}

// ── Nav Buttons ───────────────────────────────────────────────────────────────
function NavButtons({
  onBack, onNext, canNext, nextLabel = "Continue →", isFirst = false,
}: {
  onBack: () => void; onNext: () => void; canNext: boolean; nextLabel?: string; isFirst?: boolean;
}) {
  return (
    <div className="flex gap-3 mt-8">
      {!isFirst && (
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-400 font-medium text-sm hover:border-gray-300 hover:text-gray-600 transition-all">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      )}
      <motion.button
        onClick={onNext}
        disabled={!canNext}
        whileHover={canNext ? { scale: 1.02 } : {}}
        whileTap={canNext ? { scale: 0.98 } : {}}
        className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200
          ${canNext
            ? "bg-[#0D9E8F] text-white hover:bg-[#0D5C55] shadow-lg shadow-teal-200"
            : "bg-gray-100 text-gray-300 cursor-not-allowed"
          }`}
      >
        {nextLabel}
      </motion.button>
    </div>
  );
}

// ── AI Analysing Screen ───────────────────────────────────────────────────────
function AIAnalysingScreen({
  interest, name, leadId, onReportReady, onContinue,
}: {
  interest: string;
  name: string;
  leadId: number | null;
  onReportReady: (report: BrokerReport) => void;
  onContinue: () => void;
}) {
  const [aiPhase, setAiPhase] = useState(0);
  const reportedRef = useRef(false);

  // Advance AI steps every ~1.2s for visual effect
  useEffect(() => {
    if (aiPhase >= AI_STEPS.length - 1) return;
    const t = setTimeout(() => setAiPhase(p => p + 1), 1200);
    return () => clearTimeout(t);
  }, [aiPhase]);

  // Poll for report completion
  const { data: reportData } = trpc.survey.getReport.useQuery(
    { leadId: leadId ?? 0 },
    {
      enabled: leadId !== null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "ready" || status === "failed") return false;
        return 2000;
      },
    }
  );

  useEffect(() => {
    if (reportedRef.current) return;
    if (reportData?.status === "ready" && reportData.report) {
      reportedRef.current = true;
      // Ensure all AI steps are shown as complete first
      setAiPhase(AI_STEPS.length - 1);
      setTimeout(() => onReportReady(reportData.report as BrokerReport), 800);
    }
  }, [reportData, onReportReady]);

  const msg = RATE_MESSAGES[interest] ?? RATE_MESSAGES["5.5% – 6%"];
  const rawFirst = name.split(" ")[0] ?? "";
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : "";
  const isGenerating = !reportData || reportData.status === "generating" || reportData.status === "pending";

  return (
    <div className="flex flex-col items-center justify-center py-4 text-center min-h-[320px]">
      <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">AI Analysis</p>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
        className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-6">
        Analysing Your Results
      </h2>

      {/* Live AI steps */}
      <div className="space-y-2.5 w-full mb-6">
        {AI_STEPS.map((s, i) => {
          const isDone = i < aiPhase || (!isGenerating && i <= aiPhase);
          const isActive = i === aiPhase && isGenerating;
          if (i > aiPhase && isGenerating) return null;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="flex items-center gap-3 bg-gray-50 rounded-xl px-5 py-3.5"
            >
              <span className="text-xl">{s.icon}</span>
              <span className="text-sm font-medium text-gray-600 text-left">{s.text}</span>
              {isActive && (
                <motion.div
                  className="ml-auto flex gap-1"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                >
                  {[0, 1, 2].map(d => (
                    <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#0D9E8F]" />
                  ))}
                </motion.div>
              )}
              {isDone && (
                <div className="ml-auto w-5 h-5 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Waiting for AI */}
      {isGenerating && aiPhase >= AI_STEPS.length - 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-sm text-gray-400"
        >
          <Loader2 className="w-4 h-4 animate-spin text-[#0D9E8F]" />
          <span>AI is cross-checking lenders...</span>
        </motion.div>
      )}

      {/* Rate result banner (shown while waiting) */}
      {aiPhase >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`w-full rounded-2xl px-6 py-5 text-left mt-4 ${
            msg.style === "caution"
              ? "bg-amber-50 border border-amber-200"
              : "bg-[#0D5C55]"
          }`}
        >
          <div className="text-2xl mb-2">{msg.emoji}</div>
          <p className={`font-bold text-base mb-1.5 ${msg.style === "caution" ? "text-amber-800" : "text-white"}`}>
            {firstName ? `${firstName} — ${msg.headline}` : msg.headline}
          </p>
          <p className={`text-sm leading-relaxed ${msg.style === "caution" ? "text-amber-700" : "text-white/85"}`}>
            {msg.body}
          </p>
          <p className={`text-xs mt-3 leading-relaxed ${msg.style === "caution" ? "text-amber-600/70" : "text-white/45"}`}>
            This is just a guidance, final results may vary depending on your exact situation and different lender requirements.
          </p>
        </motion.div>
      )}

      {/* Continue button — appears once the analysis has finished */}
      {aiPhase >= AI_STEPS.length - 1 && (
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          onClick={onContinue}
          whileHover={{ scale: 1.02, backgroundColor: "#0D5C55" }}
          whileTap={{ scale: 0.98 }}
          className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0D9E8F] text-white font-bold tracking-wide shadow-lg shadow-teal-200 transition-colors"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.05em", fontSize: "1rem" }}
        >
          CONFIRM MY BOOKING
          <ChevronRightIcon className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}

// ── Report Ready Screen ───────────────────────────────────────────────────────
function ReportReadyScreen({
  report, name, interest, onBookCall,
}: {
  report: BrokerReport;
  name: string;
  interest: string;
  onBookCall: () => void;
}) {
  const rawFirst = name.split(" ")[0] ?? "";
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : "";
  const msg = RATE_MESSAGES[interest] ?? RATE_MESSAGES["5.5% – 6%"];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="py-2"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-white" />
        </div>
        <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F]">Your Report Is Ready</p>
      </div>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
        className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-4">
        {firstName}, here's what we found
      </h2>

      {/* Summary banner */}
      <div className={`rounded-2xl px-5 py-4 mb-5 ${msg.style === "caution" ? "bg-amber-50 border border-amber-200" : "bg-[#0D5C55]"}`}>
        <p className={`text-2xl mb-2`}>{msg.emoji}</p>
        <p className={`font-bold text-sm mb-1 ${msg.style === "caution" ? "text-amber-800" : "text-white"}`}>
          {msg.headline}
        </p>
        <p className={`text-sm leading-relaxed ${msg.style === "caution" ? "text-amber-700" : "text-white/85"}`}>
          {report.summary}
        </p>
        {report.potentialSaving && (
          <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
            msg.style === "caution" ? "bg-amber-100 text-amber-800" : "bg-white/15 text-white"
          }`}>
            <TrendingDown className="w-3.5 h-3.5" />
            Potential saving: {report.potentialSaving}
          </div>
        )}
        <p className={`text-xs mt-3 ${msg.style === "caution" ? "text-amber-600/70" : "text-white/45"}`}>
          This is just a guidance, final results may vary depending on your exact situation and different lender requirements.
        </p>
      </div>

      {/* Top lender options */}
      <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">Top Lender Options Found</p>
      <p className="text-sm text-gray-500 leading-relaxed mb-3">
        You have <strong className="text-gray-800">{report.recommendedLenders.length} lender options</strong> — book a time with a specialist over a free 10-minute call to go over your current options.
      </p>
      <div className="relative mb-5">
        {/* Blurred lender cards */}
        <div className="space-y-2.5 select-none" style={{ filter: "blur(6px)", pointerEvents: "none" }}>
          {report.recommendedLenders.slice(0, 3).map((lender, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3"
            >
              <div className="w-7 h-7 rounded-full bg-[#0D5C55] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{lender.lenderName}</p>
                <p className="text-xs text-gray-400">{lender.rateType}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-[#0D5C55]">{lender.estimatedRate}</p>
                <p className="text-xs text-green-600 font-medium">{lender.estimatedMonthlySaving}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px] px-4 text-center">
          <div className="text-2xl mb-2">🔒</div>
          <p className="text-sm font-bold text-gray-800 leading-snug">
            Book a free call with a specialist to get accurate insights on your options
          </p>
        </div>
      </div>

      {/* CTA — orange with pulse ring */}
      <div className="relative mt-2">
        {/* Pulsing ring layers */}
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ backgroundColor: "#F97316", zIndex: 0 }}
        />
        <motion.div
          animate={{ scale: [1, 1.14, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ backgroundColor: "#F97316", zIndex: 0 }}
        />
        <motion.button
          onClick={onBookCall}
          whileHover={{ scale: 1.02, backgroundColor: "#EA6C00" }}
          whileTap={{ scale: 0.98 }}
          className="relative w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl font-bold text-white shadow-xl transition-colors"
          style={{ backgroundColor: "#F97316", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, letterSpacing: "0.06em", fontSize: "1.25rem", zIndex: 1, boxShadow: "0 8px 32px rgba(249,115,22,0.45)" }}
        >
          BOOK MY FREE 10-MINUTE CALL
          <ChevronRightIcon className="w-6 h-6" strokeWidth={2.5} />
        </motion.button>
      </div>
      <p className="text-xs text-center text-gray-400 mt-2.5">Free, no obligation — takes less than 10 minutes</p>
    </motion.div>
  );
}
// ── Step Contact + Booking (combined) ────────────────────────────────────────────────────
function StepContact({
  form, setForm, onBack, onSubmit, isSubmitting,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  blockedDayKeys: Set<string>;
  blockedSlotKeys: Set<string>;
}) {
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const phoneRaw = form.phone.trim().replace(/\s/g, "");
  const phoneValid = /^04\d{8}$/.test(phoneRaw);
  const phoneError = phoneTouched && !phoneValid && phoneRaw.length > 0
    ? "Please enter a valid Australian mobile number (e.g. 0412 345 678)"
    : phoneTouched && !phoneValid && phoneRaw.length === 0
    ? "Mobile number is required"
    : null;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const detailsDone = phoneValid && emailValid;

  const today = new Date();
  const startDate = localDateKey(today);
  const endDate = localDateKey(new Date(today.getTime() + 14 * 86400_000));
  const availabilityQuery = trpc.calendar.getAvailability.useQuery(
    { startDate, endDate },
    { staleTime: 5 * 60_000 }
  );

  const availableDays = availabilityQuery.data ?? [];
  const selectedDay = availableDays.find(d => d.date === (form.bookingDate ? localDateKey(form.bookingDate) : ""));
  const availableSlots = selectedDay?.slots ?? [];

  const datePicked = !!form.bookingDate;
  const timePicked = !!form.bookingTime;
  const canSubmit = detailsDone && datePicked && timePicked;

  const selectedTz = TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0];

  // Convert a HH:MM slot (AEST UTC+10) to the user's selected timezone for display
  const convertSlot = (slot: string): string => {
    const BASE_OFFSET = 10;
    const diff = selectedTz.offsetHours - BASE_OFFSET;
    const [h, m] = slot.split(":").map(Number);
    let totalMins = h * 60 + m + diff * 60;
    totalMins = ((totalMins % 1440) + 1440) % 1440;
    const nh = Math.floor(totalMins / 60);
    const nm = totalMins % 60;
    const ampm = nh >= 12 ? "PM" : "AM";
    const h12 = nh % 12 === 0 ? 12 : nh % 12;
    return `${h12}:${nm.toString().padStart(2, "0")} ${ampm}`;
  };

  return (
    <div>
      <h2
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
        className="text-3xl sm:text-4xl text-[#0D1A18] uppercase leading-none mb-1 text-center"
      >
        You're one step away from fasttracking your mortgage refinance
      </h2>
      <p className="text-sm font-semibold text-[#0D9E8F] text-center mb-6">Required: Add your details then book your call below</p>

      {/* Section 1 — Details */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">1</span>
            </div>
            <p className="text-xs font-bold tracking-widest uppercase text-gray-600">Add Your Details</p>
          </div>
          {detailsDone && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 text-[#0D9E8F] text-xs font-semibold">
              <Check className="w-3.5 h-3.5" strokeWidth={3} /> Done
            </motion.div>
          )}
        </div>
        <div className="mb-2.5">
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input type="tel" placeholder="Phone number" value={form.phone}
              onChange={e => { setPhoneTouched(true); setForm(f => ({ ...f, phone: e.target.value })); }}
              onBlur={() => setPhoneTouched(true)} autoFocus
              className={`w-full pl-11 pr-10 py-3.5 rounded-xl border-2 bg-gray-50 font-medium text-base placeholder:text-gray-300 focus:outline-none focus:bg-white transition-all
                ${phoneValid ? "border-[#0D9E8F] text-gray-800" : "border-gray-100 text-gray-800 focus:border-[#0D9E8F]"}`} />
            {phoneValid && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0D9E8F] flex items-center justify-center"><Check className="w-3 h-3 text-white" strokeWidth={3} /></div>}
          </div>
          {phoneError && <p className="text-xs text-red-500 mt-1 ml-1">{phoneError}</p>}
        </div>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input type="email" placeholder="Email address" value={form.email}
            onChange={e => { setEmailTouched(true); setForm(f => ({ ...f, email: e.target.value })); }}
            onBlur={() => setEmailTouched(true)}
            className={`w-full pl-11 pr-10 py-3.5 rounded-xl border-2 bg-gray-50 font-medium text-base placeholder:text-gray-300 focus:outline-none focus:bg-white transition-all
              ${emailValid ? "border-[#0D9E8F] text-gray-800" : "border-gray-100 text-gray-800 focus:border-[#0D9E8F]"}`} />
          {emailValid && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0D9E8F] flex items-center justify-center"><Check className="w-3 h-3 text-white" strokeWidth={3} /></div>}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 my-5">
        <div className="flex-1 border-t-2 border-dashed border-gray-200" />
        <motion.div animate={{ y: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 3v10M5 9l4 4 4-4" stroke="#0D9E8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
        <div className="flex-1 border-t-2 border-dashed border-gray-200" />
      </div>

      {/* Timezone selector */}
      <div className="mb-4">
        <label className="text-xs font-bold tracking-widest uppercase text-gray-500 block mb-1.5">Your Timezone</label>
        <select
          value={form.timezone}
          onChange={e => setForm(f => ({ ...f, timezone: e.target.value, bookingTime: "" }))}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:border-[#0D9E8F] transition-all"
        >
          {TIMEZONES.map(tz => (
            <option key={`${tz.tz}|${tz.offsetHours}`} value={`${tz.tz}|${tz.offsetHours}`}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* Section 2 — Pick a Date */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">2</span>
          </div>
          <p className="text-xs font-bold tracking-widest uppercase text-gray-600">Pick a Date</p>
        </div>
        {availabilityQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading available dates from Calendly...
          </div>
        ) : availableDays.length === 0 ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Fetching availability, please wait...
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {availableDays.slice(0, 6).map(day => {
              const d = new Date(day.date + "T00:00:00");
              const isSelected = form.bookingDate?.toISOString().slice(0, 10) === day.date;
              return (
                <motion.button key={day.date}
                  onClick={() => setForm(f => ({ ...f, bookingDate: d, bookingTime: "" }))}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className={`px-2 py-2.5 rounded-xl border-2 text-center transition-all duration-200
                    ${isSelected ? "border-[#0D5C55] bg-[#0D5C55]/5 text-[#0D5C55]" : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"}`}>
                  <p className="text-xs font-semibold">{d.toLocaleDateString("en-AU", { weekday: "short" })}</p>
                  <p className="text-base font-bold leading-tight">{d.getDate()}</p>
                  <p className="text-xs text-gray-400">{d.toLocaleDateString("en-AU", { month: "short" })}</p>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3 — Pick a Time */}
      <AnimatePresence>
        {datePicked && availableSlots.length > 0 && (
          <motion.div key="time-slots" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <p className="text-xs font-bold tracking-widest uppercase text-gray-600">
                Pick a Time — {form.bookingDate?.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {availableSlots.map(slot => {
                const isSelected = form.bookingTime === slot;
                return (
                  <motion.button key={slot}
                    onClick={() => setForm(f => ({ ...f, bookingTime: slot }))}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all duration-200
                      ${isSelected ? "border-[#0D5C55] bg-[#0D5C55]/5 text-[#0D5C55]" : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <span>{convertSlot(slot)}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#0D5C55]" strokeWidth={2.5} />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <div className="flex gap-3 mt-2">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-400 font-medium text-sm hover:border-gray-300 hover:text-gray-600 transition-all">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <motion.button onClick={onSubmit} disabled={!canSubmit || isSubmitting}
          whileHover={canSubmit && !isSubmitting ? { scale: 1.02, backgroundColor: "#0D5C55" } : {}}
          whileTap={canSubmit && !isSubmitting ? { scale: 0.98 } : {}}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold tracking-wide transition-all duration-200
            ${canSubmit && !isSubmitting ? "bg-[#0D9E8F] text-white shadow-lg shadow-teal-200" : "bg-gray-100 text-gray-300 cursor-not-allowed"}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.05em", fontSize: "1rem" }}>
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> SUBMITTING...</>
            : <> SUBMIT MY ENQUIRY <ChevronRightIcon className="w-4 h-4" /></>}
        </motion.button>
      </div>
    </div>
  );
}

// ── Step Booking ──────────────────────────────────────────────────────────────
function StepBooking({
  form, setForm, onBack, onSubmit, isSubmitting, blockedDayKeys, blockedSlotKeys,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  blockedDayKeys: Set<string>;
  blockedSlotKeys: Set<string>;
}) {
  const businessDays = useMemo(() => getNext2AvailableDays(blockedDayKeys, blockedSlotKeys), [blockedDayKeys, blockedSlotKeys]);
  const selectedTz = TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0];
  const displaySlot = (slot: string) => convertSlotToTimezone(slot, selectedTz.offsetHours);

  const datePicked = !!form.bookingDate;
  const timePicked = !!form.bookingTime;
  const canSubmit  = datePicked && timePicked && form.bookingConfirmed;

  const showDateArrow = !datePicked;
  const showTimeArrow = datePicked && !timePicked;

  const handleDateSelect = (d: Date) => {
    setForm(f => ({ ...f, bookingDate: d, bookingTime: "", bookingConfirmed: false }));
  };

  const handleTimeSelect = (t: string) => {
    setForm(f => ({ ...f, bookingTime: t, bookingConfirmed: false }));
  };

  const handleConfirm = (yes: boolean) => {
    if (yes) {
      setForm(f => ({ ...f, bookingConfirmed: true }));
    } else {
      setForm(f => ({ ...f, bookingDate: null, bookingTime: "", bookingConfirmed: false }));
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Almost done</p>
      <h2
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
        className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2"
      >
        Book Your Call
      </h2>
      {/* Pre-filled contact summary */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <div className="w-5 h-5 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium">Phone</p>
            <p className="text-sm font-semibold text-gray-700 truncate">{form.phone}</p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <div className="w-5 h-5 rounded-full bg-[#0D9E8F] flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium">Email</p>
            <p className="text-sm font-semibold text-gray-700 truncate">{form.email}</p>
          </div>
        </div>
      </div>
      <p className="text-gray-400 text-sm mb-6">Pick a date and time that works for you — it only takes 10 minutes.</p>

      {/* Date picker */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-[#0D9E8F]" />
          <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F]">
            Choose A Date We Can Reach You
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {businessDays.map((d: Date, i: number) => {
            const isSelected = form.bookingDate?.toDateString() === d.toDateString();
            return (
              <motion.button
                key={i}
                onClick={() => handleDateSelect(d)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`px-3 py-2.5 rounded-xl border-2 text-center transition-all duration-200
                  ${isSelected
                    ? "border-[#0D5C55] bg-[#0D5C55]/5 text-[#0D5C55]"
                    : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                  }`}
              >
                <p className="text-xs font-semibold">{d.toLocaleDateString("en-AU", { weekday: "short" })}</p>
                <p className="text-sm font-bold">{d.getDate()}</p>
                <p className="text-xs text-gray-400">{d.toLocaleDateString("en-AU", { month: "short" })}</p>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>{showDateArrow && <BouncingArrow />}</AnimatePresence>
      </div>

      {/* Time slots */}
      <AnimatePresence>
        {datePicked && !form.bookingConfirmed && (
          <motion.div key="time-section" variants={revealVariants} initial="hidden" animate="visible" className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F]">
                Choose a time on {formatDate(form.bookingDate!)}
              </p>
            </div>
            {/* Timezone selector */}
            <div className="mb-3">
              <label className="text-xs text-gray-400 font-medium mb-1 block">Your timezone</label>
              <select
                value={form.timezone}
                onChange={e => setForm(f => ({ ...f, timezone: e.target.value, bookingTime: "", bookingConfirmed: false }))}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:border-[#0D9E8F] transition-all"
              >
                {TIMEZONES.map(t => (
                  <option key={`${t.tz}|${t.offsetHours}`} value={`${t.tz}|${t.offsetHours}`}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TIME_SLOTS.map(slot => {
                const isSelected = form.bookingTime === slot;
                const blocked = isSlotBlocked(form.bookingDate, slot, blockedDayKeys, blockedSlotKeys);
                return (
                  <motion.button
                    key={slot}
                    onClick={() => { if (!blocked) handleTimeSelect(slot); }}
                    disabled={blocked}
                    whileHover={blocked ? {} : { scale: 1.02 }}
                    whileTap={blocked ? {} : { scale: 0.98 }}
                    className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all duration-200
                      ${blocked
                        ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through"
                        : isSelected
                        ? "border-[#0D5C55] bg-[#0D5C55]/5 text-[#0D5C55]"
                        : "border-gray-100 bg-white text-gray-600 hover:border-gray-200"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{displaySlot(slot)}</span>
                      {blocked
                        ? <span className="text-[10px] text-gray-300 font-semibold uppercase">Unavailable</span>
                        : isSelected && <Check className="w-3.5 h-3.5 text-[#0D5C55]" strokeWidth={2.5} />
                      }
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence>{showTimeArrow && <BouncingArrow />}</AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation */}
      <AnimatePresence>
        {datePicked && timePicked && !form.bookingConfirmed && (
          <motion.div key="confirm-section" variants={revealVariants} initial="hidden" animate="visible" className="mt-6">
            <div className="bg-[#0D5C55]/6 border border-[#0D5C55]/20 rounded-xl px-5 py-4">
              <p className="text-sm font-bold text-[#0D5C55] mb-1">Confirm your booking</p>
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-semibold">{formatDate(form.bookingDate!)}</span> at{" "}
                <span className="font-semibold">{displaySlot(form.bookingTime)}</span>
                <br />
                <span className="text-gray-400 text-xs">{selectedTz.label} · A specialist will call you at this time.</span>
              </p>
              <div className="flex gap-2">
                <motion.button
                  onClick={() => handleConfirm(true)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#0D9E8F] text-white font-bold text-sm hover:bg-[#0D5C55] transition-colors shadow-md shadow-teal-100"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.04em" }}
                >
                  <Check className="w-4 h-4" />
                  YES, THAT WORKS
                </motion.button>
                <motion.button
                  onClick={() => handleConfirm(false)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-medium text-sm hover:border-gray-300 transition-all"
                >
                  Change
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmed summary */}
      <AnimatePresence>
        {form.bookingConfirmed && (
          <motion.div key="confirmed-summary" variants={revealVariants} initial="hidden" animate="visible" className="mt-6">
            <div className="bg-[#0D5C55] rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Booking confirmed</p>
                <p className="text-white/80 text-xs mt-0.5">
                  {formatDate(form.bookingDate!)} · {displaySlot(form.bookingTime)} · {selectedTz.label.split("–")[0].trim()}
                </p>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, bookingDate: null, bookingTime: "", bookingConfirmed: false }))}
                className="text-white/60 hover:text-white text-xs underline transition-colors"
              >
                Change
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <div className="flex gap-3 mt-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-400 font-medium text-sm hover:border-gray-300 hover:text-gray-600 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <motion.button
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          whileHover={canSubmit && !isSubmitting ? { scale: 1.02, backgroundColor: "#0D5C55" } : {}}
          whileTap={canSubmit && !isSubmitting ? { scale: 0.98 } : {}}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold tracking-wide transition-all duration-200
            ${canSubmit && !isSubmitting
              ? "bg-[#0D9E8F] text-white shadow-lg shadow-teal-200"
              : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.05em", fontSize: "1rem" }}
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> SUBMITTING...</>
          ) : (
            <> SUBMIT MY ENQUIRY <ChevronRightIcon className="w-4 h-4" /></>
          )}
        </motion.button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Step names for partial submission tracking
const STEP_NAMES: Record<number, string> = {
  1: "Name",
  2: "Bank Selection",
  3: "Loan Size",
  4: "Interest Rate",
  5: "Timeline",
  6: "Contact Details",
};

export default function Home() {
  const [phase, setPhase] = useState<"intro" | "survey" | "analysing" | "report_ready">("intro");
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [aiReport, setAiReport] = useState<BrokerReport | null>(null);
  const [form, setForm] = useState<FormData>({
    name: "", bank: "", phone: "", email: "",
    loanSize: "", interest: "", timeline: "",
    bookingDate: null, bookingTime: "", bookingTimezone: "", bookingConfirmed: false, timezone: detectTimezone(),
  });

  const submitMutation = trpc.survey.submit.useMutation();
  const { data: blockedData = [] } = trpc.calendar.getBlocked.useQuery();
  const trpcUtils = trpc.useUtils();
  const blockedDayKeySet = useMemo(() => {
    const s = new Set<string>();
    blockedData.filter(b => !b.slotKey && b.dateKey.split("-").length === 3).forEach(b => s.add(b.dateKey));
    return s;
  }, [blockedData]);
  const blockedSlotKeySet = useMemo(() => {
    const s = new Set<string>();
    blockedData.filter(b => !!b.slotKey).forEach(b => s.add(`${b.dateKey}|${b.slotKey}`));
    return s;
  }, [blockedData]);
  const go = useCallback((next: number) => {
    // Fire partial submission tracking when advancing forward
    if (next > step && STEP_NAMES[step]) {
      trackSurveyStep(STEP_NAMES[step], step);
    }
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }, [step]);

  const canProceed: Record<number, boolean> = {
    1: form.name.trim().length > 1,
    2: !!form.bank,
    3: !!form.loanSize,
    4: !!form.interest,
    5: !!form.timeline,
    6: /^04\d{8}$/.test(form.phone.trim().replace(/\s/g, '')) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
  };

  const handleStep6Submit = async () => {
    // Track Step 6 completion
    trackSurveyStep(STEP_NAMES[6], 6);
    // Fire Lead event
    trackLead({
      phone: form.phone,
      email: form.email,
      bank: BANKS.find(b => b.id === form.bank)?.name ?? form.bank,
      loanSize: form.loanSize,
      interestRate: form.interest,
    });
    // Fire Schedule event if booking was picked
    if (form.bookingDate && form.bookingTime) {
      trackBooking({
        date: formatDate(form.bookingDate),
        time: form.bookingTime,
        name: form.name,
      });
    }
    // Submit lead with booking details included
    const bankName = BANKS.find(b => b.id === form.bank)?.name ?? form.bank;
    try {
      const result = await submitMutation.mutateAsync({
        name: form.name,
        phone: form.phone,
        email: form.email,
        bank: form.bank,
        bankName,
        loanSize: form.loanSize,
        interest: form.interest,
        timeline: form.timeline,
        bookingDate: form.bookingDate ? localDateKey(form.bookingDate) : undefined,
        bookingTime: form.bookingTime || undefined,
        bookingTimezone: (TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone)?.label ?? form.timezone) || undefined,
      });
      setLeadId(result.leadId);
    } catch (err) {
      console.error("Lead submit failed:", err);
    }
    setPhase("analysing");
  };

  const handleReportReady = useCallback((report: BrokerReport) => {
    setAiReport(report);
    setPhase("report_ready");
    // If booking was already made in step 6, mark as submitted
    setForm(f => {
      if (f.bookingDate && f.bookingTime) {
        setSubmitted(true);
      }
      return f;
    });
  }, []);

  const handleBookCall = () => {
    // "Book My Free Call" on report screen goes to step 6 (combined contact+booking)
    setPhase("survey");
    setStep(6);
    setDirection(1);
  };

  // ── Submitted ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F0F0EE] flex flex-col items-center justify-center px-4">
        <div className="mb-10"><BrandHeader /></div>
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="w-16 h-16 rounded-full bg-[#0D9E8F] flex items-center justify-center mx-auto mb-6"
          >
            <Check className="w-8 h-8 text-white" strokeWidth={2.5} />
          </motion.div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl text-[#0D5C55] uppercase mb-3">
            You're all set!
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Thanks, <strong>{form.name}</strong>. We'll call you on{" "}
            <strong>{form.phone}</strong>
            {form.bookingDate && (
              <> on <strong>{formatDate(form.bookingDate)}</strong> at <strong>{(TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0]).label.split("–")[0].trim()}</strong> <strong>{convertSlotToTimezone(form.bookingTime, (TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0]).offsetHours)}</strong></>
            )}.
          </p>

          {form.bookingDate && form.bookingTime && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">📅 Add to your calendar</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <motion.a
                  href={buildGoogleCalendarUrl({
                    date: form.bookingDate,
                    slot: form.bookingTime,
                    name: form.name,
                    phone: form.phone,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-xs hover:border-[#0D9E8F] hover:text-[#0D9E8F] transition-colors"
                >
                  Google
                </motion.a>
                <motion.a
                  href={buildOutlookCalendarUrl({
                    date: form.bookingDate,
                    slot: form.bookingTime,
                    name: form.name,
                    phone: form.phone,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-xs hover:border-[#0D9E8F] hover:text-[#0D9E8F] transition-colors"
                >
                  Outlook
                </motion.a>
                <motion.button
                  onClick={() => {
                    const ics = buildIcsFile({
                      date: form.bookingDate!,
                      slot: form.bookingTime,
                      name: form.name,
                      phone: form.phone,
                    });
                    downloadIcsFile(ics, "refinance-call.ics");
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-xs hover:border-[#0D9E8F] hover:text-[#0D9E8F] transition-colors"
                >
                  Apple / iCal
                </motion.button>
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left mb-4">
            <p className="text-xs font-bold text-amber-700 mb-1.5 uppercase tracking-wide">💡 Quick tip</p>
            <p className="text-xs text-amber-700/90 leading-relaxed">
              Have your most recent home loan statement handy if you can — it helps us give you accurate numbers on the call.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Current bank</span>
              <span className="font-semibold text-gray-700">{BANKS.find(b => b.id === form.bank)?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Loan size</span>
              <span className="font-semibold text-gray-700">{form.loanSize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Interest rate</span>
              <span className="font-semibold text-gray-700">{form.interest}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Timeline</span>
              <span className="font-semibold text-gray-700">{form.timeline}</span>
            </div>
            {form.bookingDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Booking</span>
                <span className="font-semibold text-gray-700">
                  {formatDate(form.bookingDate)} · {convertSlotToTimezone(form.bookingTime, (TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0]).offsetHours)} · {(TIMEZONES.find(t => `${t.tz}|${t.offsetHours}` === form.timezone) ?? TIMEZONES[0]).label.split("–")[0].trim()}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Intro ──
  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-[#F0F0EE] flex flex-col">
        <BrandHeader />
        <div className="flex items-center justify-center gap-0 mt-6 mb-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div className="w-3.5 h-3.5 rounded-full bg-gray-300 flex-shrink-0" />
              {i < TOTAL_STEPS - 1 && <div className="w-6 sm:w-10 h-0.5 bg-gray-200 flex-shrink-0" />}
            </div>
          ))}
        </div>
        <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl w-full"
          >
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-400 mb-4">
              Servicing clients across Australia 🇦🇺
            </p>
            <h1
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.01em" }}
              className="text-5xl sm:text-6xl md:text-7xl text-[#0D1A18] uppercase mb-6"
            >
              Check Your Interest Rate Options In 30 Seconds
            </h1>
            <p className="text-gray-500 text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-8">
              Find out how much you can save in 15 seconds across 30+ lenders with our 100% free interest rate checking tool.
            </p>
            <div className="flex flex-col items-center gap-3 relative">
              {/* Hand-drawn curvy doodle arrow pointing at the button */}
              <motion.div
                animate={{ y: [0, 8, 0], rotate: [0, -3, 3, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
                aria-hidden="true"
                style={{ filter: "drop-shadow(0 2px 4px rgba(13,158,143,0.3))" }}
              >
                <svg width="72" height="64" viewBox="0 0 72 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Curvy hand-drawn style path */}
                  <path
                    d="M 8 6 C 12 6, 28 4, 36 14 C 44 24, 40 38, 36 50"
                    stroke="#0D9E8F"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                    style={{ strokeDasharray: "none" }}
                  />
                  {/* Arrowhead */}
                  <path
                    d="M 28 46 C 30 50, 34 54, 36 50 C 38 46, 44 44, 46 46"
                    stroke="#0D9E8F"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </motion.div>
              <motion.button
                onClick={() => {
                  const today = new Date();
                  trpcUtils.calendar.getAvailability.prefetch({
                    startDate: today.toISOString().slice(0, 10),
                    endDate: new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10),
                  });
                  setPhase("survey");
                }}
                whileHover={{ scale: 1.03, backgroundColor: "#0D5C55" }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center justify-center gap-3 px-10 py-5 rounded-xl font-bold text-lg text-white transition-colors duration-200"
                style={{ backgroundColor: "#0D9E8F", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: "0.04em" }}
              >
                GET STARTED
                <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
              </motion.button>
            </div>
            <div className="flex items-center justify-center gap-2 mt-6">
              <div className="flex items-center gap-0.5">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={`w-4 h-4 ${i <= 4 ? "fill-yellow-400 text-yellow-400" : "fill-yellow-200 text-yellow-200"}`} />
                ))}
              </div>
              <span className="text-sm text-gray-400 font-medium">4.8 stars from 1,200+ Australians helped</span>
            </div>
          </motion.div>
        </main>
        <ComplianceFooter />
      </div>
    );
  }

  // ── Analysing interstitial ──
  if (phase === "analysing") {
    return (
      <div className="min-h-screen bg-[#F0F0EE] flex flex-col">
        <BrandHeader />
        <div className="flex items-center justify-center gap-0 mt-6 mb-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div className="w-3.5 h-3.5 rounded-full bg-[#0D5C55] flex-shrink-0" />
              {i < TOTAL_STEPS - 1 && <div className="w-6 sm:w-10 h-0.5 bg-[#0D5C55] flex-shrink-0" />}
            </div>
          ))}
        </div>
        <main className="flex-1 flex items-start justify-center px-4 pb-16 pt-8">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl overflow-hidden">
            <div className="p-8 sm:p-10">
              <AIAnalysingScreen
                interest={form.interest}
                name={form.name}
                leadId={leadId}
                onReportReady={handleReportReady}
                onContinue={() => setSubmitted(true)}
              />
            </div>
          </div>
        </main>
        <ComplianceFooter />
      </div>
    );
  }

  // ── Report Ready ──
  if (phase === "report_ready" && aiReport) {
    return (
      <div className="min-h-screen bg-[#F0F0EE] flex flex-col">
        <BrandHeader />
        <div className="flex items-center justify-center gap-0 mt-6 mb-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div className="w-3.5 h-3.5 rounded-full bg-[#0D5C55] flex-shrink-0" />
              {i < TOTAL_STEPS - 1 && <div className="w-6 sm:w-10 h-0.5 bg-[#0D5C55] flex-shrink-0" />}
            </div>
          ))}
        </div>
        <main className="flex-1 flex items-start justify-center px-4 pb-16 pt-8">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl overflow-hidden">
            <div className="p-8 sm:p-10">
              <ReportReadyScreen
                report={aiReport}
                name={form.name}
                interest={form.interest}
                onBookCall={handleBookCall}
              />
            </div>
          </div>
        </main>
        <ComplianceFooter />
      </div>
    );
  }

  // ── Survey ──
  return (
    <div className="min-h-screen bg-[#F0F0EE] flex flex-col">
      <BrandHeader />
      <div className="mt-6">
        <DotProgress step={step} total={TOTAL_STEPS} />
      </div>
      <main className="flex-1 flex items-start justify-center px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl overflow-hidden">
          <div className="p-8 sm:p-10">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={transition}
              >
                {/* Step 1: Name */}
                {step === 1 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Let's get started</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2">
                      What's your name?
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">We'll personalise your experience.</p>
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && canProceed[1] && go(2)}
                      className="w-full px-5 py-3.5 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-800 font-medium text-base placeholder:text-gray-300 focus:outline-none focus:border-[#0D9E8F] focus:bg-white transition-all"
                      autoFocus
                    />
                    <NavButtons onBack={() => {}} onNext={() => go(2)} canNext={canProceed[1]} isFirst />
                  </div>
                )}

                {/* Step 2: Bank */}
                {step === 2 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Current lender</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2">
                      What bank are you with?
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">Select your current home loan lender.</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                      {BANKS.map(bank => (
                        <BankCard key={bank.id} bank={bank} selected={form.bank === bank.id} onClick={() => {
                          setForm(f => ({ ...f, bank: bank.id }));
                          setTimeout(() => go(3), 320);
                        }} />
                      ))}
                    </div>
                    <NavButtons onBack={() => go(1)} onNext={() => go(3)} canNext={canProceed[2]} />
                  </div>
                )}

                {/* Step 3: Loan size */}
                {step === 3 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Loan details</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2">
                      What is your loan size?
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">Approximate outstanding balance is fine.</p>
                    <div className="space-y-2.5">
                      {LOAN_SIZES.map(size => (
                        <OptionPill key={size} label={size} selected={form.loanSize === size} onClick={() => {
                          setForm(f => ({ ...f, loanSize: size }));
                          setTimeout(() => go(4), 320);
                        }} />
                      ))}
                    </div>
                    <NavButtons onBack={() => go(2)} onNext={() => go(4)} canNext={canProceed[3]} />
                  </div>
                )}

                {/* Step 4: Interest rate */}
                {step === 4 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Your rate</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2">
                      How much interest are you paying?
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">Rough estimate is perfectly fine.</p>
                    <div className="space-y-2.5">
                      {INTEREST_RANGES.map(range => (
                        <OptionPill key={range} label={range} selected={form.interest === range} onClick={() => {
                          setForm(f => ({ ...f, interest: range }));
                          setTimeout(() => go(5), 320);
                        }} />
                      ))}
                    </div>
                    <NavButtons onBack={() => go(3)} onNext={() => go(5)} canNext={canProceed[4]} />
                  </div>
                )}

                {/* Step 5: Timeline */}
                {step === 5 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-[#0D9E8F] mb-3">Motivation</p>
                    <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-4xl sm:text-5xl text-[#0D1A18] uppercase leading-none mb-2">
                      How motivated are you to get a better interest rate?
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">We'll tailor our approach to your situation.</p>
                    <div className="grid grid-cols-3 gap-3">
                      {TIMELINES.map(({ emoji, level, desc, value, color }) => (
                        <motion.button
                          key={value}
                          onClick={() => { setForm(f => ({ ...f, timeline: value })); setTimeout(() => go(6), 320); }}
                          whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(13,92,85,0.15)" }}
                          whileTap={{ scale: 0.97 }}
                          className={`relative flex flex-col items-center justify-center gap-3 pt-0 pb-5 px-5 rounded-xl border-2 overflow-hidden transition-all duration-200 bg-white text-center
                            ${form.timeline === value ? "border-[#0D5C55] shadow-md" : "border-gray-100 hover:border-gray-200"}`}
                        >
                          {form.timeline === value && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                              className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#0D5C55] flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                          <div className="w-full h-2 mb-2 rounded-t-xl" style={{ backgroundColor: color }} />
                          <span className="text-4xl">{emoji}</span>
                          <span className="text-base font-extrabold text-[#0D1A18]">{level}</span>
                          <span className="text-xs font-medium text-gray-500 leading-tight">{desc}</span>
                        </motion.button>
                      ))}
                    </div>
                    <NavButtons onBack={() => go(4)} onNext={() => go(6)} canNext={canProceed[5]} />
                  </div>
                )}

                {/* Step 6: Contact + Booking (combined) */}
                {step === 6 && (
                  <StepContact
                    form={form}
                    setForm={setForm}
                    onBack={() => go(5)}
                    onSubmit={handleStep6Submit}
                    isSubmitting={submitMutation.isPending}
                    blockedDayKeys={blockedDayKeySet}
                    blockedSlotKeys={blockedSlotKeySet}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="border-t border-gray-50 px-8 sm:px-10 py-3 bg-gray-50/60 flex items-center justify-between">
            <p className="text-xs text-gray-300">Secure · Confidential · Free</p>
            <p className="text-xs text-gray-400 font-medium">Step {step} of {TOTAL_STEPS}</p>
          </div>
        </div>
      </main>
      <ComplianceFooter />
    </div>
  );
}
