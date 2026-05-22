/**
 * Broker Admin — weekly calendar with bookings + block-out + lead list
 * Route: /reports
 */

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  FileText, Phone, Mail, Calendar, TrendingDown,
  ChevronDown, ChevronUp, Clock, CheckCircle, AlertCircle, Loader2,
  User, ChevronLeft, ChevronRight, Ban, X, Search,
} from "lucide-react";
import type { BrokerReport, LenderOption } from "../../../server/routers";
import type { Lead } from "../../../drizzle/schema";

// ── Constants ──────────────────────────────────────────────────────────────────
// Hourly rows 8am – 4pm; each row contains two 30-min half-slots
// Blocking operates on HH:00 (the full hour key)
const HOUR_SLOTS: string[] = [];
for (let h = 8; h <= 16; h++) {
  HOUR_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
}

function slotLabel(slot: string) {
  const [h] = slot.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:00 ${ampm}`;
}

// Convert "Tue, 6 May" style booking date to YYYY-MM-DD
function parseBookingDateKey(bookingDate: string): string | null {
  try {
    const year = new Date().getFullYear();
    const d = new Date(`${bookingDate} ${year}`);
    if (isNaN(d.getTime())) {
      const d2 = new Date(`${bookingDate} ${year + 1}`);
      if (isNaN(d2.getTime())) return null;
      return d2.toISOString().slice(0, 10);
    }
    // If the date is in the past, try next year
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) {
      const d2 = new Date(`${bookingDate} ${year + 1}`);
      if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Convert bookingTime "9:00 AM – 9:30 AM" to "HH:MM"
function parseBookingTimeKey(bookingTime: string): string | null {
  try {
    const match = bookingTime.match(/^(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

// ── Weekly Calendar ────────────────────────────────────────────────────────────
function WeeklyCalendar({ leads }: { leads: Lead[] }) {
  const utils = trpc.useUtils();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [showBlockedSlots, setShowBlockedSlots] = useState(false);

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  });

  const { data: blockedData = [], refetch: refetchBlocked } = trpc.calendar.getBlocked.useQuery();
  const blockMutation = trpc.calendar.blockSlot.useMutation({ onSuccess: () => refetchBlocked() });
  const unblockMutation = trpc.calendar.unblockSlot.useMutation({ onSuccess: () => refetchBlocked() });

  // Drag-to-paint — 100% ref-driven, zero React state updates during drag
  const isDraggingRef = useRef(false);
  const dragModeRef = useRef<"block" | "unblock">("block");
  const pendingCellsRef = useRef<Set<string>>(new Set());
  const draggedRef = useRef<Set<string>>(new Set());
  const batchRef = useRef<{ dateKey: string; slotKey: string; mode: "block" | "unblock" }[]>([]);
  // cellRefs: direct DOM refs for instant visual feedback without React re-render
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const blockedDaySet = useMemo(() => {
    const s = new Set<string>();
    blockedData.filter(b => !b.slotKey).forEach(b => s.add(b.dateKey));
    return s;
  }, [blockedData]);

  const blockedSlotSet = useMemo(() => {
    const s = new Set<string>();
    blockedData.filter(b => b.slotKey).forEach(b => s.add(`${b.dateKey}|${b.slotKey}`));
    return s;
  }, [blockedData]);

  // Effective blocked slots = server data + pending optimistic changes (ref-based, no memo delay)
  const effectiveBlockedSlotSet = new Set(blockedSlotSet);
  pendingCellsRef.current.forEach(k => {
    if (dragModeRef.current === "block") effectiveBlockedSlotSet.add(k);
    else effectiveBlockedSlotSet.delete(k);
  });

  // Bookings map: use exact 30-min slot key (HH:MM)
  const bookingsMap = useMemo(() => {
    const map = new Map<string, Lead[]>();
    leads.forEach(lead => {
      if (!lead.bookingDate) return;
      const dateKey = parseBookingDateKey(lead.bookingDate);
      if (!dateKey) return;
      const timeKey = lead.bookingTime ? parseBookingTimeKey(lead.bookingTime) : null;
      const key = timeKey ? `${dateKey}|${timeKey}` : `${dateKey}|none`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lead);
    });
    return map;
  }, [leads]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const prevWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    setWeekStart(d);
  };

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${weekStart.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
  })();

  const toggleDayBlock = (dateKey: string) => {
    if (blockedDaySet.has(dateKey)) {
      unblockMutation.mutate({ dateKey });
    } else {
      blockMutation.mutate({ dateKey });
    }
  };

  // Apply instant DOM style to a cell — bypasses React render cycle entirely
  const applyDomStyle = (cellKey: string, mode: "block" | "unblock") => {
    const el = cellRefs.current.get(cellKey);
    if (!el) return;
    if (mode === "block") {
      el.style.background = "rgba(239,68,68,0.35)";
      el.style.outline = "2px solid #ef4444";
      el.style.outlineOffset = "-2px";
    } else {
      el.style.background = "";
      el.style.outline = "";
      el.style.outlineOffset = "";
    }
  };

  const paintCell = (dateKey: string, slot: string) => {
    const cellKey = `${dateKey}|${slot}`;
    if (draggedRef.current.has(cellKey)) return;
    draggedRef.current.add(cellKey);
    pendingCellsRef.current.add(cellKey);
    // Instant DOM update — no React re-render needed
    applyDomStyle(cellKey, dragModeRef.current);
    // Queue for batch server sync on mouseup
    batchRef.current.push({ dateKey, slotKey: slot, mode: dragModeRef.current });
  };

  const handleCellMouseDown = (dateKey: string, slot: string, isSlotBlocked: boolean, isDayBlocked: boolean, isPast: boolean) => {
    if (isPast || isDayBlocked) return;
    const mode = isSlotBlocked ? "unblock" : "block";
    draggedRef.current = new Set();
    batchRef.current = [];
    pendingCellsRef.current = new Set();
    dragModeRef.current = mode;
    isDraggingRef.current = true;
    // NO React state updates here — zero re-renders during drag
    paintCell(dateKey, slot);
  };

  const handleCellMouseEnter = (dateKey: string, slot: string, isDayBlocked: boolean, isPast: boolean) => {
    if (!isDraggingRef.current || isPast || isDayBlocked) return;
    paintCell(dateKey, slot);
  };

  const handleMouseUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    // Flush all queued mutations to server in one batch
    const batch = [...batchRef.current];
    batchRef.current = [];
    draggedRef.current = new Set();
    // Clear DOM paint styles — server refetch will re-render with persisted state
    pendingCellsRef.current.forEach(k => {
      const el = cellRefs.current.get(k);
      if (el) { el.style.background = ""; el.style.outline = ""; el.style.outlineOffset = ""; }
    });
    pendingCellsRef.current = new Set();
    // Fire mutations (triggers refetch via onSuccess)
    batch.forEach(({ dateKey, slotKey, mode }) => {
      if (mode === "block") blockMutation.mutate({ dateKey, slotKey });
      else unblockMutation.mutate({ dateKey, slotKey });
    });
  };

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-[#0D9E8F]" />
          <div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }}
              className="text-xl text-[#0D1A18] uppercase tracking-wide">Booking Calendar</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click a day header to block the whole day · Click a slot to block that time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#0D5C55] hover:text-[#0D5C55] transition-colors text-gray-500">Today</button>
          <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
          <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-50 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#0D9E8F]/20 border border-[#0D9E8F]/40 inline-block" /> Booking</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1.5 ml-auto italic text-gray-400 text-xs">
          Click day header to block whole day · Click or drag slots to block/unblock
        </span>
      </div>

      {/* Calendar grid */}
      <div
        className="overflow-x-auto"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="min-w-[640px]">
          {/* Day headers */}
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "72px repeat(7, 1fr)" }}>
            <div className="border-r border-gray-100" />
            {weekDays.map((day, i) => {
              const dateKey = day.toISOString().slice(0, 10);
              const isToday = day.toDateString() === today.toDateString();
              const isBlocked = blockedDaySet.has(dateKey);
              const isPast = day < today;
              return (
                <button
                  key={dateKey}
                  onClick={() => !isPast && toggleDayBlock(dateKey)}
                  disabled={isPast}
                  title={isBlocked ? "Click to unblock day" : "Click to block whole day"}
                  className={`
                    py-3 px-1 text-center border-r border-gray-100 last:border-r-0 transition-colors
                    ${isPast ? "opacity-40 cursor-default" : "cursor-pointer hover:bg-gray-50"}
                    ${isBlocked && !isPast ? "bg-red-50 hover:bg-red-100" : ""}
                    ${isToday ? "bg-[#0D5C55]/5" : ""}
                  `}
                >
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isBlocked ? "text-red-400" : "text-gray-400"}`}>{DAY_NAMES[i]}</p>
                  <p className={`text-lg font-bold leading-tight ${isToday ? "text-[#0D5C55]" : isBlocked ? "text-red-500" : "text-gray-700"}`}>
                    {day.getDate()}
                  </p>
                  <p className={`text-xs ${isBlocked ? "text-red-400" : "text-gray-300"}`}>
                    {day.toLocaleDateString("en-AU", { month: "short" })}
                  </p>
                  {isBlocked && <Ban className="w-3 h-3 text-red-400 mx-auto mt-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Hourly rows 8am–4pm — each row has a faint 30-min divider at the midpoint */}
          <div className="overflow-y-auto max-h-[560px]" style={{ userSelect: "none" }}>
            {HOUR_SLOTS.map((slot) => (
              <div key={slot} className="grid border-b border-gray-200 last:border-b-0" style={{ gridTemplateColumns: "72px repeat(7, 1fr)", minHeight: "64px" }}>
                {/* Time label — top-aligned, always visible */}
                <div className="border-r border-gray-200 flex flex-col justify-between py-1 pr-3 items-end">
                  <span className="text-xs text-gray-600 font-bold whitespace-nowrap">{slotLabel(slot)}</span>
                  {/* 30-min sub-label */}
                  <span className="text-[10px] text-gray-300 whitespace-nowrap">:30</span>
                </div>
                {/* Day cells */}
                {weekDays.map((day) => {
                  const dateKey = day.toISOString().slice(0, 10);
                  const cellKey = `${dateKey}|${slot}`;
                  const isDayBlocked = blockedDaySet.has(dateKey);
                  const isSlotBlocked = effectiveBlockedSlotSet.has(cellKey);
                  const isBlocked = isDayBlocked || isSlotBlocked;
                  const isPast = day < today;
                  // Check bookings for both the :00 and :30 sub-slots
                  const [hStr] = slot.split(":");
                  const bookings00 = bookingsMap.get(`${dateKey}|${hStr}:00`) ?? [];
                  const bookings30 = bookingsMap.get(`${dateKey}|${hStr}:30`) ?? [];
                  return (
                    <div
                      key={dateKey}
                      ref={el => {
                        if (el) cellRefs.current.set(cellKey, el);
                        else cellRefs.current.delete(cellKey);
                      }}
                      onMouseDown={() => handleCellMouseDown(dateKey, slot, effectiveBlockedSlotSet.has(cellKey), isDayBlocked, isPast)}
                      onMouseEnter={() => handleCellMouseEnter(dateKey, slot, isDayBlocked, isPast)}
                      title={isDayBlocked ? "Whole day blocked" : isSlotBlocked ? "Click/drag to unblock" : "Click or drag to block"}
                      className={`
                        relative border-r border-gray-200 last:border-r-0 flex flex-col
                        ${isPast ? "opacity-30" : isDayBlocked ? "bg-red-50 cursor-not-allowed" : "cursor-pointer"}
                        ${isSlotBlocked && !isDayBlocked ? "bg-red-100" : ""}
                        ${!isBlocked && !isPast ? "hover:bg-gray-50" : ""}
                      `}
                    >
                      {/* Top half (:00 slot) */}
                      <div className="flex-1 relative border-b border-dashed border-gray-200 overflow-hidden">
                        {/* Blocked indicator (sits underneath any booking) */}
                        {isSlotBlocked && !isDayBlocked && bookings00.length === 0 && (
                          <div className="absolute inset-0.5 rounded bg-red-300/50 flex items-center justify-center">
                            <Ban className="w-3 h-3 text-red-500" />
                          </div>
                        )}
                        {/* Booking pill — always rendered if a booking exists */}
                        {bookings00.length > 0 && (
                          <div className={`absolute inset-0.5 rounded flex items-center px-1.5 overflow-hidden shadow-sm
                            ${isBlocked ? "bg-[#0D5C55] ring-2 ring-red-500" : "bg-[#0D5C55]"}`}>
                            {isBlocked && <AlertCircle className="w-3 h-3 text-red-300 mr-1 flex-shrink-0" />}
                            <p className="text-white text-[11px] font-semibold truncate">{bookings00[0].name}</p>
                          </div>
                        )}
                      </div>
                      {/* Bottom half (:30 slot) */}
                      <div className="flex-1 relative overflow-hidden">
                        {/* Booking pill — always rendered if a booking exists */}
                        {bookings30.length > 0 && (
                          <div className={`absolute inset-0.5 rounded flex items-center px-1.5 overflow-hidden shadow-sm
                            ${isBlocked ? "bg-[#0D5C55] ring-2 ring-red-500" : "bg-[#0D5C55]"}`}>
                            {isBlocked && <AlertCircle className="w-3 h-3 text-red-300 mr-1 flex-shrink-0" />}
                            <p className="text-white text-[11px] font-semibold truncate">{bookings30[0].name}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blocked summary — collapsible */}
      {(blockedDaySet.size > 0 || blockedData.filter(b => b.slotKey).length > 0) && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => setShowBlockedSlots(v => !v)}
            className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide hover:text-gray-600 transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${showBlockedSlots ? "rotate-90" : ""}`} />
            Blocked ({blockedDaySet.size + blockedData.filter(b => b.slotKey).length})
          </button>
          {showBlockedSlots && (
            <div className="mt-2 flex flex-col gap-2">
              {/* All-day blocked dates */}
              {Array.from(blockedDaySet).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Array.from(blockedDaySet).map(dateKey => (
                    <span key={dateKey} className="inline-flex items-center gap-1 bg-red-50 border border-red-200 text-red-500 text-xs font-semibold px-2 py-1 rounded-lg">
                      <Ban className="w-3 h-3" />
                      {new Date(dateKey + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} (all day)
                      <button onClick={() => unblockMutation.mutate({ dateKey })} className="ml-1 hover:text-red-700 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Individual blocked slots */}
              {blockedData.filter(b => b.slotKey).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {blockedData.filter(b => b.slotKey).map(b => (
                    <span key={`${b.dateKey}|${b.slotKey}`} className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-600 text-xs font-semibold px-2 py-1 rounded-lg">
                      <Clock className="w-3 h-3" />
                      {new Date(b.dateKey + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} · {slotLabel(b.slotKey!)}
                      <button onClick={() => unblockMutation.mutate({ dateKey: b.dateKey, slotKey: b.slotKey ?? undefined })} className="ml-1 hover:text-orange-800 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => blockedData.filter(b => b.slotKey).forEach(b => unblockMutation.mutate({ dateKey: b.dateKey, slotKey: b.slotKey ?? undefined }))}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors self-center"
                  >
                    Clear all slots
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready:      "bg-green-100 text-green-700 border border-green-200",
    generating: "bg-amber-100 text-amber-700 border border-amber-200",
    pending:    "bg-gray-100 text-gray-500 border border-gray-200",
    failed:     "bg-red-100 text-red-600 border border-red-200",
  };
  const icons: Record<string, React.ReactNode> = {
    ready:      <CheckCircle className="w-3 h-3" />,
    generating: <Loader2 className="w-3 h-3 animate-spin" />,
    pending:    <Clock className="w-3 h-3" />,
    failed:     <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] ?? styles.pending}`}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function LenderCard({ lender, rank }: { lender: LenderOption; rank: number }) {
  return (
    <div className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
      <div className="w-7 h-7 rounded-full bg-[#0D5C55] flex items-center justify-center flex-shrink-0 text-white text-xs font-bold mt-0.5">{rank}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-800">{lender.lenderName}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#0D5C55]">{lender.estimatedRate}</span>
            <span className="text-xs text-gray-400">{lender.rateType}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-green-600 font-semibold">{lender.estimatedMonthlySaving}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-green-600">{lender.annualSaving}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{lender.suitability}</p>
        {lender.features.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lender.features.map((f, i) => (
              <span key={i} className="text-xs bg-[#0D5C55]/8 text-[#0D5C55] px-2 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({ lead }: {
  lead: Lead;
}) {
  const [expanded, setExpanded] = useState(false);
  const report = lead.aiReport as BrokerReport | null;
  const hasBooking = !!lead.bookingDate;

  return (
    <>
      <motion.div layout className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-colors">
        {hasBooking && (
          <div className="bg-[#0D5C55] px-5 py-2 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
            <span className="text-white text-xs font-semibold flex-1">
              {lead.bookingDate} · {lead.bookingTime}
            </span>
            {lead.bookingTimezone && (
              <span className="text-white/70 text-xs font-normal">
                {lead.bookingTimezone.split("–")[0].trim()}
              </span>
            )}
          </div>
        )}
        <div className="flex items-start gap-3 p-5">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(e => !e)}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0D5C55]/10 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-[#0D5C55]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <p className="font-bold text-gray-800 text-base">{lead.name}</p>
                  <StatusBadge status={lead.reportStatus} />
                  {!hasBooking && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400 border border-gray-200">No booking</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                  <span className="flex items-center gap-1 text-sm text-gray-600 font-medium"><Phone className="w-3.5 h-3.5 text-gray-400" />{lead.phone}</span>
                  <span className="flex items-center gap-1 text-sm text-gray-600"><Mail className="w-3.5 h-3.5 text-gray-400" />{lead.email}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 bg-gray-50 rounded-xl px-4 py-3">
                  <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Bank</p><p className="text-sm text-gray-700 font-medium">{lead.bankName}</p></div>
                  <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Loan Size</p><p className="text-sm text-gray-700 font-medium">{lead.loanSize}</p></div>
                  <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Interest Rate</p><p className="text-sm text-gray-700 font-medium">{lead.interest}</p></div>
                  <div><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Timeline</p><p className="text-sm text-gray-700 font-medium">{lead.timeline}</p></div>
                  {lead.bookingTimezone && (
                    <div className="col-span-2"><p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Timezone</p><p className="text-xs text-gray-500">{lead.bookingTimezone}</p></div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <p className="text-xs text-gray-300">{new Date(lead.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(e => !e)} className="text-gray-300 hover:text-gray-500 transition-colors">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {expanded && report && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
              <div className="border-t border-gray-100 p-5 space-y-5">
                <div className="bg-[#0D5C55] rounded-xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-white/70" /><p className="text-xs font-semibold text-white/70 uppercase tracking-wide">AI Broker Report</p></div>
                  <p className="text-white text-sm leading-relaxed mb-3">{report.summary}</p>
                  <p className="text-white/70 text-xs leading-relaxed mb-3">{report.currentSituation}</p>
                  {report.potentialSaving && (
                    <div className="inline-flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-lg">
                      <TrendingDown className="w-3.5 h-3.5 text-white" />
                      <span className="text-white text-xs font-bold">Potential saving: {report.potentialSaving}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">Recommended Lenders ({report.recommendedLenders.length})</p>
                  <div className="space-y-2.5">{report.recommendedLenders.map((l, i) => <LenderCard key={i} lender={l} rank={i + 1} />)}</div>
                </div>
                {report.nextSteps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">Next Steps</p>
                    <ol className="space-y-1.5">{report.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <span className="w-5 h-5 rounded-full bg-[#0D9E8F]/15 text-[#0D9E8F] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>{step}
                      </li>
                    ))}</ol>
                  </div>
                )}
                {report.riskNotes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Risk Notes</p>
                    <p className="text-xs text-amber-600 leading-relaxed">{report.riskNotes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {expanded && !report && lead.reportStatus !== "ready" && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="border-t border-gray-100 p-5">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  {lead.reportStatus === "generating" ? <><Loader2 className="w-4 h-4 animate-spin text-[#0D9E8F]" />Generating report...</>
                    : lead.reportStatus === "failed" ? <><AlertCircle className="w-4 h-4 text-red-400" />Report generation failed.</>
                    : <><Clock className="w-4 h-4" />Report pending.</>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
type LeadFilter = "all" | "today" | "thisWeek" | "upcoming" | "past";

const INITIAL_VISIBLE_COUNT = 15;

export default function BrokerAdmin() {
  const { data: leads, isLoading, error } = trpc.survey.getAllLeads.useQuery();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [showAll, setShowAll] = useState(false);

  // Compute date boundaries used by the filter chips. Uses local-day boundaries
  // so "Today" means the broker's local day, not UTC.
  const dateBoundaries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Week = today through Sunday (inclusive). If today is Sunday, that's just today.
    const endOfWeek = new Date(today);
    const dow = today.getDay(); // 0 = Sun
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
    const endOfWeekKey = endOfWeek.toISOString().slice(0, 10);

    return { todayKey, endOfWeekKey };
  }, []);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    const q = search.trim().toLowerCase();

    return leads
      .filter(lead => {
        // Text search across the fields a broker would scan for.
        if (q) {
          const hay = `${lead.name} ${lead.email} ${lead.phone} ${lead.bankName ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        // Time bucket filter — applies to booking date, not submission date.
        if (filter === "all") return true;

        const bookKey = lead.bookingDate ? parseBookingDateKey(lead.bookingDate) : null;
        // Leads without a parseable booking date only show in "All".
        if (!bookKey) return false;

        if (filter === "today") return bookKey === dateBoundaries.todayKey;
        if (filter === "thisWeek") return bookKey >= dateBoundaries.todayKey && bookKey <= dateBoundaries.endOfWeekKey;
        if (filter === "upcoming") return bookKey >= dateBoundaries.todayKey;
        if (filter === "past") return bookKey < dateBoundaries.todayKey;
        return true;
      })
      // Newest submissions at the top.
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leads, search, filter, dateBoundaries]);

  // Compute counts for the filter chips so the user sees how many in each bucket.
  const counts = useMemo(() => {
    const c = { all: 0, today: 0, thisWeek: 0, upcoming: 0, past: 0 };
    if (!leads) return c;
    c.all = leads.length;
    for (const lead of leads) {
      const bookKey = lead.bookingDate ? parseBookingDateKey(lead.bookingDate) : null;
      if (!bookKey) continue;
      if (bookKey === dateBoundaries.todayKey) c.today++;
      if (bookKey >= dateBoundaries.todayKey && bookKey <= dateBoundaries.endOfWeekKey) c.thisWeek++;
      if (bookKey >= dateBoundaries.todayKey) c.upcoming++;
      if (bookKey < dateBoundaries.todayKey) c.past++;
    }
    return c;
  }, [leads, dateBoundaries]);

  const visibleLeads = showAll ? filteredLeads : filteredLeads.slice(0, INITIAL_VISIBLE_COUNT);
  const hiddenCount = filteredLeads.length - visibleLeads.length;

  const FILTER_CHIPS: { id: LeadFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "today", label: "Today", count: counts.today },
    { id: "thisWeek", label: "This week", count: counts.thisWeek },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
    { id: "past", label: "Past", count: counts.past },
  ];

  return (
    <div className="min-h-screen bg-[#F0F0EE]">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663412142004/MqkHRp8irWn8dMYsECtkoh/finchecker-logo-transparent_e7a5e4b3.png" alt="Finchecker" className="h-8" />
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm font-semibold text-gray-500">Finance Report</span>
        </div>
        <a href="/" className="text-xs text-gray-400 hover:text-[#0D5C55] transition-colors font-medium">← Back to Survey</a>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <WeeklyCalendar leads={leads ?? []} />

        {/* Leads header */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900 }} className="text-3xl text-[#0D1A18] uppercase">All Leads</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"}
              {filter !== "all" || search ? ` (of ${counts.all} total)` : ""}
            </p>
          </div>
          {(leads?.length ?? 0) > 0 && (
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle className="w-3.5 h-3.5" />{leads?.filter(l => l.reportStatus === "ready").length} ready</span>
              <span className="flex items-center gap-1 text-amber-600 font-medium"><Loader2 className="w-3.5 h-3.5" />{leads?.filter(l => l.reportStatus === "generating").length} generating</span>
            </div>
          )}
        </div>

        {/* Search + filters */}
        {(leads?.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4 shadow-sm">
            {/* Search */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowAll(false); }}
                placeholder="Search by name, email, phone, or bank..."
                className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 focus:bg-white focus:outline-none focus:border-[#0D9E8F] transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors p-1"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map(chip => {
                const active = filter === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => { setFilter(chip.id); setShowAll(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${active
                        ? "bg-[#0D5C55] text-white"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                  >
                    {chip.label}
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold
                      ${active ? "bg-white/20 text-white" : "bg-white text-gray-400"}`}>
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isLoading && <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#0D9E8F]" /></div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">Failed to load leads. Please refresh.</div>}
        {!isLoading && filteredLeads.length === 0 && (leads?.length ?? 0) === 0 && (
          <div className="text-center py-20"><FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-gray-400 text-sm">No leads yet.</p></div>
        )}
        {!isLoading && filteredLeads.length === 0 && (leads?.length ?? 0) > 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <Search className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium mb-1">No leads match</p>
            <p className="text-gray-400 text-xs mb-4">Try clearing your search or selecting a different filter.</p>
            <button
              onClick={() => { setSearch(""); setFilter("all"); }}
              className="text-xs font-semibold text-[#0D5C55] hover:text-[#0D9E8F] transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="space-y-3">
          {visibleLeads.map(lead => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>

        {hiddenCount > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-[#0D5C55] hover:text-[#0D5C55] transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              Show {hiddenCount} more {hiddenCount === 1 ? "lead" : "leads"}
            </button>
          </div>
        )}
        {showAll && filteredLeads.length > INITIAL_VISIBLE_COUNT && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll(false)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Collapse
            </button>
          </div>
        )}
      </main>

      <p className="text-center text-xs text-gray-300 pb-6 mt-4">v1.19</p>
    </div>
  );
}
