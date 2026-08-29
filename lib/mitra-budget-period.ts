import type { BudgetPeriod } from "./mitra-production-budgets";

export type DateRange = {
  start: string;
  end: string;
};

export function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekRange(dateKey: string): DateRange {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: formatDateKey(start), end: formatDateKey(end) };
}

export function formatBudgetPeriodSelection(period: BudgetPeriod, dateKey: string) {
  const date = parseDateKey(dateKey);
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
  if (period === "Hari") return formatter.format(date);
  if (period === "Minggu") {
    const range = getWeekRange(dateKey);
    return `${formatter.format(parseDateKey(range.start))} – ${formatter.format(parseDateKey(range.end))}`;
  }
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date);
}

export function getCalendarMonthDays(monthKey: string) {
  const month = parseDateKey(`${monthKey}-01`);
  const firstDay = month.getDay();
  const mondayIndex = firstDay === 0 ? 6 : firstDay - 1;
  const firstCell = new Date(month);
  firstCell.setDate(1 - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return formatDateKey(date);
  });
}

export function shiftCalendarMonth(monthKey: string, offset: number) {
  const month = parseDateKey(`${monthKey}-01`);
  month.setMonth(month.getMonth() + offset);
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

export function dateKeyToMonthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function getPeriodStorageKey(productId: string, period: BudgetPeriod) {
  return `${productId}:${period}`;
}

export function isDateInSelectedPeriod(period: BudgetPeriod, selectedDateKey: string, candidateDateKey: string) {
  if (period === "Hari") return selectedDateKey === candidateDateKey;
  if (period === "Bulan") return selectedDateKey.slice(0, 7) === candidateDateKey.slice(0, 7);
  const range = getWeekRange(selectedDateKey);
  return candidateDateKey >= range.start && candidateDateKey <= range.end;
}
