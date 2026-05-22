import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock DB helpers so tests don't need a real database
vi.mock("./db", () => ({
  createLead: vi.fn().mockResolvedValue(42),
  updateLeadReport: vi.fn().mockResolvedValue(undefined),
  updateLeadStatus: vi.fn().mockResolvedValue(undefined),
  getLeadById: vi.fn().mockResolvedValue({
    id: 42,
    name: "Test User",
    phone: "0400000000",
    email: "test@example.com",
    bank: "anz",
    bankName: "ANZ",
    loanSize: "$500,000 – $750,000",
    interest: "6% – 6.5%",
    timeline: "As soon as possible",
    bookingDate: null,
    bookingTime: null,
    bookingTimezone: null,
    aiReport: null,
    reportStatus: "generating",
    createdAt: new Date(),
  }),
  getAllLeads: vi.fn().mockResolvedValue([]),
  deleteLead: vi.fn().mockResolvedValue(undefined),
  getBlockedSlots: vi.fn().mockResolvedValue([]),
  addBlockedSlot: vi.fn().mockResolvedValue(undefined),
  removeBlockedSlot: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// Mock notifyOwner so tests don't make real HTTP calls
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock invokeLLM so tests don't make real LLM calls
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      summary: "Test summary",
      currentSituation: "Test situation",
      potentialSaving: "$200/month",
      recommendedLenders: [],
      nextSteps: ["Step 1"],
      riskNotes: "None",
      generatedAt: new Date().toISOString(),
    }) } }],
  }),
}));

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("survey.submit", () => {
  it("creates a lead and returns a leadId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.survey.submit({
      name: "Test User",
      phone: "0400000000",
      email: "test@example.com",
      bank: "anz",
      bankName: "ANZ",
      loanSize: "$500,000 – $750,000",
      interest: "6% – 6.5%",
      timeline: "As soon as possible",
    });
    expect(result).toHaveProperty("leadId");
    expect(typeof result.leadId).toBe("number");
  });
});

describe("survey.getReport", () => {
  it("returns report status for a known lead", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.survey.getReport({ leadId: 42 });
    expect(result).toHaveProperty("status");
    expect(["pending", "generating", "ready", "failed"]).toContain(result.status);
  });
});

describe("survey.getAllLeads", () => {
  it("returns an array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.survey.getAllLeads();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("calendar.getBlocked", () => {
  it("returns an array of blocked slots", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.calendar.getBlocked();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("calendar.blockSlot", () => {
  it("blocks a slot successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.calendar.blockSlot({ dateKey: "2026-05-10", slotKey: "09:00" });
    expect(result).toEqual({ success: true });
  });
});

describe("calendar.unblockSlot", () => {
  it("unblocks a slot successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.calendar.unblockSlot({ dateKey: "2026-05-10", slotKey: "09:00" });
    expect(result).toEqual({ success: true });
  });
});
