// Quiet-hours configuration tables. Federal default populated.
// State quiet-hours table populated in Bubble 1b after a separate web verification pass.

export interface QuietHoursWindow {
  /** "HH:MM" 24h, inclusive lower bound. */
  start: string;
  /** "HH:MM" 24h, exclusive upper bound. end < start means the allowed window wraps midnight. */
  end: string;
}

export interface QuietHoursRegime {
  /** Calls allowed inside this window. Quiet hours = everything outside it. */
  allowed_window: QuietHoursWindow;
}

// 47 CFR 64.1200(c)(1): no calls before 8 AM or after 9 PM recipient local time.
export const FEDERAL_QUIET_HOURS: QuietHoursRegime = {
  allowed_window: { start: '08:00', end: '21:00' },
};

// State-specific overrides. Intersected with FEDERAL_QUIET_HOURS at evaluation time.
// Empty in Bubble 1a; Bubble 1b populates from a verified state regulations table.
// TODO(Bubble 1b): populate state quiet-hours overrides (TX, OH, GA, etc.).
export const STATE_QUIET_HOURS: Record<string, QuietHoursRegime> = {};
