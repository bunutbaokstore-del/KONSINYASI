import { describe, expect, it } from "vitest";
import { formatBudgetPeriodSelection, getCalendarMonthDays, getWeekRange } from "../lib/mitra-budget-period";

describe("Mitra production budget calendar periods", () => {
  it("returns a Monday-to-Sunday range for a selected week", () => {
    expect(getWeekRange("2026-08-26")).toEqual({ start: "2026-08-24", end: "2026-08-30" });
    expect(getWeekRange("2026-08-30")).toEqual({ start: "2026-08-24", end: "2026-08-30" });
  });

  it("formats day, week, and month selections", () => {
    expect(formatBudgetPeriodSelection("Hari", "2026-08-26")).toContain("26");
    expect(formatBudgetPeriodSelection("Minggu", "2026-08-26")).toContain("24");
    expect(formatBudgetPeriodSelection("Minggu", "2026-08-26")).toContain("30");
    expect(formatBudgetPeriodSelection("Bulan", "2026-08-26")).toContain("2026");
  });

  it("builds a complete Monday-first calendar grid", () => {
    const days = getCalendarMonthDays("2026-08");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-07-27");
    expect(days[7]).toBe("2026-08-03");
  });
});
