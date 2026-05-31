import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { createLead, updateLeadReport, updateLeadStatus, getLeadById, getAllLeads, getBlockedSlots, addBlockedSlot, removeBlockedSlot } from "./db";
import { z } from "zod";
import { getCalendlyAvailability, bookCalendlySlot } from "./calendly";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  survey: router({
    // Submit survey and create a lead record, then trigger AI report generation
    submit: publicProcedure
      .input(z.object({
        name: z.string(),
        phone: z.string(),
        email: z.string(),
        bank: z.string(),
        bankName: z.string(),
        loanSize: z.string(),
        interest: z.string(),
        timeline: z.string(),
        bookingDate: z.string().optional(),
        bookingTime: z.string().optional(),
        bookingTimezone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const leadId = await createLead({
          name: input.name,
          phone: input.phone,
          email: input.email,
          bank: input.bank,
          bankName: input.bankName,
          loanSize: input.loanSize,
          interest: input.interest,
          timeline: input.timeline,
          bookingDate: input.bookingDate,
          bookingTime: input.bookingTime,
          bookingTimezone: input.bookingTimezone,
          reportStatus: "generating",
        });

        // Generate AI broker report asynchronously
        generateBrokerReport(leadId, input).catch(err =>
          console.error("[AI Report] Generation failed for lead", leadId, err)
        );

        // Book Calendly slot in background (fire-and-forget)
        if (input.bookingDate && input.bookingTime && input.bookingTime !== "via Calendly") {
          bookCalendlySlot({
            name: input.name,
            email: input.email,
            phone: input.phone,
            date: input.bookingDate,
            time: input.bookingTime,
          }).catch(err => console.error("[Calendly] Booking failed:", err));
        }

        // Notify owner
        await notifyOwner({
          title: `New refinance enquiry from ${input.name}`,
          content: `Phone: ${input.phone}\nEmail: ${input.email}\nBank: ${input.bankName}\nLoan: ${input.loanSize}\nRate: ${input.interest}\nTimeline: ${input.timeline}\nBooking: ${input.bookingDate ?? "TBC"} ${input.bookingTime ?? ""} ${input.bookingTimezone ? "(" + input.bookingTimezone + ")" : ""}`,
        }).catch(() => {});

        return { leadId };
      }),

    // Poll report status
    getReport: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) return { status: "not_found" as const, report: null };
        return {
          status: lead.reportStatus,
          report: lead.aiReport as BrokerReport | null,
        };
      }),

    // Admin: get all leads
    getAllLeads: publicProcedure.query(async () => {
      return getAllLeads();
    }),

    // Admin: delete a lead — DISABLED. Deletion has been removed from the
    // admin UI; keeping this procedure throw-only as defense-in-depth so direct
    // API calls cannot remove leads either.
    deleteLead: publicProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async () => {
        throw new Error("Lead deletion is disabled");
      }),
  }),

  calendar: router({
    // Get available slots from Calendly for a date range
    getAvailability: publicProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCalendlyAvailability(input.startDate, input.endDate);
        } catch (err) {
          console.error("[Calendly] Availability fetch failed:", err);
          return [];
        }
      }),

    // Get all blocked slots
    getBlocked: publicProcedure.query(async () => {
      return getBlockedSlots();
    }),

    // Block a slot (slotKey = "HH:MM" or omit for whole day)
    blockSlot: publicProcedure
      .input(z.object({ dateKey: z.string(), slotKey: z.string().optional() }))
      .mutation(async ({ input }) => {
        await addBlockedSlot(input.dateKey, input.slotKey);
        return { success: true };
      }),

    // Unblock a slot or whole day
    unblockSlot: publicProcedure
      .input(z.object({ dateKey: z.string(), slotKey: z.string().optional() }))
      .mutation(async ({ input }) => {
        await removeBlockedSlot(input.dateKey, input.slotKey);
        return { success: true };
      }),
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────────────

export interface LenderOption {
  lenderName: string;
  estimatedRate: string;
  rateType: string;
  estimatedMonthlySaving: string;
  annualSaving: string;
  features: string[];
  suitability: string;
}

export interface BrokerReport {
  summary: string;
  currentSituation: string;
  potentialSaving: string;
  recommendedLenders: LenderOption[];
  nextSteps: string[];
  riskNotes: string;
  generatedAt: string;
}

// ── AI Report Generator ────────────────────────────────────────────────────────────────

async function generateBrokerReport(
  leadId: number,
  data: {
    name: string;
    bank: string;
    bankName: string;
    loanSize: string;
    interest: string;
    timeline: string;
  }
) {
  try {
    await updateLeadStatus(leadId, "generating");

    const prompt = `You are an expert Australian mortgage broker assistant. Analyse the following client's home loan situation and generate a detailed broker report.

CLIENT DETAILS:
- Name: ${data.name}
- Current Bank: ${data.bankName}
- Loan Size: ${data.loanSize}
- Current Interest Rate: ${data.interest}
- Timeline to Switch: ${data.timeline}

Generate a comprehensive broker report with:
1. A brief summary of the client's situation
2. An assessment of their current situation vs market rates
3. Estimated potential savings
4. 4-5 specific lender recommendations with realistic current Australian market rates (as of 2025-2026)
5. Clear next steps for the client
6. Any risk notes or considerations

Use realistic Australian lenders such as: ANZ, Commonwealth Bank, Westpac, NAB, ING, Macquarie, St. George, Suncorp, Bendigo Bank, Bank of Melbourne, HSBC Australia, Athena, Reduce Home Loans, Unloan, etc.

Return ONLY valid JSON matching this exact schema with no extra text.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert Australian mortgage broker. Always return valid JSON only, no markdown, no extra text." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "broker_report",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              currentSituation: { type: "string" },
              potentialSaving: { type: "string" },
              recommendedLenders: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    lenderName: { type: "string" },
                    estimatedRate: { type: "string" },
                    rateType: { type: "string" },
                    estimatedMonthlySaving: { type: "string" },
                    annualSaving: { type: "string" },
                    features: { type: "array", items: { type: "string" } },
                    suitability: { type: "string" },
                  },
                  required: ["lenderName", "estimatedRate", "rateType", "estimatedMonthlySaving", "annualSaving", "features", "suitability"],
                  additionalProperties: false,
                },
              },
              nextSteps: { type: "array", items: { type: "string" } },
              riskNotes: { type: "string" },
              generatedAt: { type: "string" },
            },
            required: ["summary", "currentSituation", "potentialSaving", "recommendedLenders", "nextSteps", "riskNotes", "generatedAt"],
            additionalProperties: false,
          },
        },
      },
    } as any);

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No content from LLM");

    const report: BrokerReport = typeof content === "string" ? JSON.parse(content) : content;
    report.generatedAt = new Date().toISOString();

    await updateLeadReport(leadId, report, "ready");
    console.log(`[AI Report] Generated successfully for lead ${leadId}`);
  } catch (err) {
    console.error("[AI Report] Failed:", err);
    await updateLeadReport(leadId, null, "failed");
  }
}

export type AppRouter = typeof appRouter;
