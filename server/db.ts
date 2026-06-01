import { eq, and, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, leads, InsertLead, Lead, blockedSlots, BlockedSlot, calendlySlots } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Lead helpers ──────────────────────────────────────────────────────────────

export async function createLead(data: InsertLead): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leads).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateLeadReport(id: number, aiReport: unknown, status: "ready" | "failed"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ aiReport: aiReport as any, reportStatus: status }).where(eq(leads.id, id));
}

export async function updateLeadStatus(id: number, status: "pending" | "generating" | "ready" | "failed"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ reportStatus: status }).where(eq(leads.id, id));
}

export async function getLeadById(id: number): Promise<Lead | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllLeads(): Promise<Lead[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    return await db.select().from(leads).where(isNull(leads.deletedAt)).orderBy(leads.createdAt);
  } catch {
    // deletedAt column missing — query without it using raw SQL
    const [rows] = await (db as any).$client.query(
      "SELECT id, name, phone, email, bank, bankName, loanSize, interest, timeline, bookingDate, bookingTime, bookingTimezone, aiReport, reportStatus, createdAt FROM leads ORDER BY createdAt"
    );
    return rows as Lead[];
  }
}

export async function deleteLead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));
}

// ── Blocked slots helpers ──────────────────────────────────────────────────────

export async function getBlockedSlots(): Promise<BlockedSlot[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(blockedSlots);
}

export async function addBlockedSlot(dateKey: string, slotKey?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Avoid duplicate
  const existing = await db.select().from(blockedSlots)
    .where(and(eq(blockedSlots.dateKey, dateKey), slotKey ? eq(blockedSlots.slotKey, slotKey) : eq(blockedSlots.slotKey, null as any)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(blockedSlots).values({ dateKey, slotKey: slotKey ?? null });
  }
}

// ── Calendly synced slots ─────────────────────────────────────────────────────

export async function storeCalendlySlots(days: { date: string; slots: string[] }[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(calendlySlots);
  const rows = days.flatMap(day => day.slots.map(slot => ({ dateKey: day.date, slotKey: slot })));
  if (rows.length > 0) {
    await db.insert(calendlySlots).values(rows);
  }
  console.log(`[CalendlySync] Stored ${rows.length} slots across ${days.length} days`);
}

export async function getBookedSlots(startDate: string, endDate: string): Promise<{ dateKey: string; slotKey: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ dateKey: leads.bookingDate, slotKey: leads.bookingTime }).from(leads);
  return result
    .filter(r => r.dateKey && r.slotKey && r.dateKey >= startDate && r.dateKey <= endDate)
    .map(r => ({ dateKey: r.dateKey!, slotKey: r.slotKey! }));
}

export async function readCalendlySlots(): Promise<{ dateKey: string; slotKey: string }[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select({ dateKey: calendlySlots.dateKey, slotKey: calendlySlots.slotKey }).from(calendlySlots);
  } catch (err) {
    console.error("[Database] readCalendlySlots failed:", err);
    return [];
  }
}

export async function removeBlockedSlot(dateKey: string, slotKey?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (slotKey) {
    await db.delete(blockedSlots).where(and(eq(blockedSlots.dateKey, dateKey), eq(blockedSlots.slotKey, slotKey)));
  } else {
    // Remove all blocks for this day
    await db.delete(blockedSlots).where(eq(blockedSlots.dateKey, dateKey));
  }
}
