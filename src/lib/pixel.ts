/**
 * Meta Pixel helper — wraps fbq calls safely so they never throw
 * if the pixel hasn't loaded yet (e.g. ad blockers, SSR).
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

/** Fired when the user advances past each survey step (partial submission) */
export function trackSurveyStep(stepName: string, stepNumber: number) {
  fbq("trackCustom", "SurveyStepComplete", {
    step_name: stepName,
    step_number: stepNumber,
    content_name: "Refinance Survey",
  });
}

/** Fired when the user submits their contact details (phone + email) */
export function trackLead(data: {
  phone?: string;
  email?: string;
  bank?: string;
  loanSize?: string;
  interestRate?: string;
}) {
  fbq("track", "Lead", {
    content_name: "Refinance Survey Lead",
    content_category: "Mortgage Refinance",
    ...data,
  });
}

/** Fired when the user confirms a booking (date + time selected + confirmed) */
export function trackBooking(data: {
  date?: string;
  time?: string;
  name?: string;
}) {
  fbq("track", "Schedule", {
    content_name: "Refinance Specialist Call",
    content_category: "Mortgage Refinance",
    ...data,
  });
}
