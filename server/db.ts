import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, leads, InsertLead, Lead, blockedSlots, BlockedSlot } from "../drizzle/schema";
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
  return db.select().from(leads).orderBy(leads.createdAt);
}

export async function deleteLead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq(leads.id, id));
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

// ── Calendly synced slots (raw SQL — no schema dependency) ────────────────────

async function ensureCalendlyTable(db: ReturnType<typeof drizzle>) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS calendlySlots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dateKey VARCHAR(16) NOT NULL,
      slotKey VARCHAR(8) NOT NULL,
      syncedAt TIMESTAMP DEFAULT NOW()
    )
  `));
}

export async function storeCalendlySlots(days: { date: string; slots: string[] }[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureCalendlyTable(db);
  await db.execute(sql.raw("DELETE FROM calendlySlots"));
  for (const day of days) {
    for (const slot of day.slots) {
      await db.execute(sql`INSERT INTO calendlySlots (dateKey, slotKey) VALUES (${day.date}, ${slot})`);
    }
  }
  console.log(`[CalendlySync] Stored ${days.reduce((n, d) => n + d.slots.length, 0)} slots across ${days.length} days`);
}

export async function readCalendlySlots(): Promise<{ dateKey: string; slotKey: string }[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    await ensureCalendlyTable(db);
    const result = await db.execute(sql.raw("SELECT dateKey, slotKey FROM calendlySlots"));
    return (result[0] as unknown as any[]).map((r: any) => ({ dateKey: r.dateKey, slotKey: r.slotKey }));
  } catch {
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
