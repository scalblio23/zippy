import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Leads table — stores each completed survey submission
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  bank: varchar("bank", { length: 64 }).notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  loanSize: varchar("loanSize", { length: 128 }).notNull(),
  interest: varchar("interest", { length: 64 }).notNull(),
  timeline: varchar("timeline", { length: 128 }).notNull(),
  bookingDate: varchar("bookingDate", { length: 64 }),
  bookingTime: varchar("bookingTime", { length: 64 }),
  bookingTimezone: varchar("bookingTimezone", { length: 128 }),
  aiReport: json("aiReport"),
  reportStatus: mysqlEnum("reportStatus", ["pending", "generating", "ready", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Blocked slots table — stores time slots the broker has blocked off
// dateKey format: "YYYY-MM-DD"
// slotKey format: "HH:MM" 24h (e.g. "09:00") — null means whole day blocked
export const blockedSlots = mysqlTable("blockedSlots", {
  id: int("id").autoincrement().primaryKey(),
  dateKey: varchar("dateKey", { length: 16 }).notNull(),
  slotKey: varchar("slotKey", { length: 8 }), // null = whole day
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlockedSlot = typeof blockedSlots.$inferSelect;
export type InsertBlockedSlot = typeof blockedSlots.$inferInsert;