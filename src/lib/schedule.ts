// Supplier schedule: the days and hours a supplier takes field service jobs,
// their days off, and booking rules. Jobs are booked in 2-hour slots inside
// these hours; anything outside them is an "after-hours callout" with an extra
// fee (supplier_pricing.after_hours_fee). Times are Queensland time.
// The tables are read-only to the browser; saving goes through the
// save_supplier_schedule function (supabase/migrations/0025_supplier_schedule.sql).

import { supabase } from "../supabaseClient";

export const SLOT_HOURS = 2;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const SCHEDULE_TIMEZONE = "Australia/Brisbane";

export interface DayHours {
  on: boolean;
  start: number; // whole hours, 0-24
  end: number;
}

export interface Schedule {
  hours: DayHours[]; // 7 entries, Monday first
  minNoticeHours: number;
  maxDaysAhead: number;
  holdHours: number;
  daysOff: string[]; // "YYYY-MM-DD", sorted
}

// Keep in step with default_schedule_hours() in migration 0025.
export function defaultSchedule(): Schedule {
  return {
    hours: [
      { on: true, start: 7, end: 17 },
      { on: true, start: 7, end: 17 },
      { on: true, start: 7, end: 17 },
      { on: true, start: 7, end: 17 },
      { on: true, start: 7, end: 16 },
      { on: false, start: 8, end: 12 },
      { on: false, start: 8, end: 12 },
    ],
    minNoticeHours: 24,
    maxDaysAhead: 56,
    holdHours: 48,
    daysOff: [],
  };
}

// 0 = Monday ... 6 = Sunday, for a local calendar date.
export const weekdayIndex = (d: Date): number => (d.getDay() + 6) % 7;

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "7 am", "12 pm", "5 pm"
export function formatHour(h: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${h < 12 || h === 24 ? "am" : "pm"}`;
}

// A day's bookable slots: back-to-back 2-hour blocks from the start hour.
// A closed day has none. (Booked / held times are layered on in phase 2.)
export function slotsForHours(day: DayHours): { start: number; end: number }[] {
  if (!day.on) return [];
  const out: { start: number; end: number }[] = [];
  for (let s = day.start; s + SLOT_HOURS <= day.end; s += SLOT_HOURS) out.push({ start: s, end: s + SLOT_HOURS });
  return out;
}

export function slotsForDate(schedule: Schedule, d: Date): { start: number; end: number }[] {
  if (schedule.daysOff.includes(dateKey(d))) return [];
  return slotsForHours(schedule.hours[weekdayIndex(d)]);
}

// Whole hours left over after the last full slot, e.g. 7-16 leaves 1.
export function leftoverHours(day: DayHours): number {
  return day.on ? (day.end - day.start) % SLOT_HOURS : 0;
}

// Returns a problem to show next to the form, or "" when it can be saved.
export function scheduleProblem(s: Schedule): string {
  if (s.hours.length !== 7) return "Hours are missing for some days.";
  for (const h of s.hours) {
    if (!Number.isInteger(h.start) || !Number.isInteger(h.end)) return "Hours must be whole hours.";
    if (h.start < 0 || h.end > 24 || h.end - h.start < SLOT_HOURS) return "Each day needs at least one 2-hour slot between its start and finish.";
  }
  if (!s.hours.some((h) => h.on)) return "Switch at least one day on, or customers will only be able to book after-hours callouts.";
  return "";
}

type Row = Record<string, any>;

export function scheduleFromRows(row: Row | null, daysOffRows: Row[]): Schedule {
  const base = defaultSchedule();
  const days = daysOffRows.map((r) => String(r.day)).sort();
  if (!row) return { ...base, daysOff: days };
  const hours = Array.isArray(row.hours) && row.hours.length === 7
    ? row.hours.map((h: Row, i: number) => ({
        on: !!h.on,
        start: Number.isFinite(h.start) ? h.start : base.hours[i].start,
        end: Number.isFinite(h.end) ? h.end : base.hours[i].end,
      }))
    : base.hours;
  return {
    hours,
    minNoticeHours: row.min_notice_hours ?? base.minNoticeHours,
    maxDaysAhead: row.max_days_ahead ?? base.maxDaysAhead,
    holdHours: row.hold_hours ?? base.holdHours,
    daysOff: days,
  };
}

export async function loadSchedule(supplierId: string): Promise<Schedule> {
  const [sched, off] = await Promise.all([
    supabase.from("supplier_schedule").select("*").eq("supplier_id", supplierId).maybeSingle(),
    supabase.from("supplier_days_off").select("day").eq("supplier_id", supplierId),
  ]);
  if (sched.error) throw new Error(sched.error.message);
  if (off.error) throw new Error(off.error.message);
  return scheduleFromRows(sched.data, off.data ?? []);
}

export async function saveSchedule(supplierId: string, s: Schedule): Promise<void> {
  const problem = scheduleProblem(s);
  if (problem) throw new Error(problem);
  const { error } = await supabase.rpc("save_supplier_schedule", {
    p_supplier_id: supplierId,
    p_hours: s.hours,
    p_min_notice_hours: s.minNoticeHours,
    p_max_days_ahead: s.maxDaysAhead,
    p_hold_hours: s.holdHours,
    p_days_off: s.daysOff,
  });
  if (error) throw new Error(error.message);
}
