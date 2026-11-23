// Supplier calendar: what is booked, blocked or held, and the actions on it
// (block time, move a booking, arrange an after-hours time). The appointments
// table is read-only to the browser; every change goes through the functions in
// supabase/migrations/0027_supplier_calendar.sql, which check the caller is that
// supplier (or an admin) and let the database refuse overlaps. All times are
// Queensland time (UTC+10, no daylight saving).

import { supabase } from "../supabaseClient";
import { slotDateKey, type Slot } from "./schedule";

export interface Appointment {
  id: string;
  supplierId: string;
  requestId: string | null;
  kind: "job" | "block";
  state: "held" | "confirmed";
  startsAt: string;
  endsAt: string;
  heldUntil: string | null;
  note: string;
}

type Row = Record<string, any>;

function appointmentFromRow(r: Row): Appointment {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    requestId: r.request_id ?? null,
    kind: r.kind,
    state: r.state,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    heldUntil: r.held_until ?? null,
    note: r.note ?? "",
  };
}

// Active (held / confirmed) appointments that haven't finished yet, soonest first.
export async function loadAppointments(supplierId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, supplier_id, request_id, kind, state, starts_at, ends_at, held_until, note")
    .eq("supplier_id", supplierId)
    .in("state", ["held", "confirmed"])
    .gt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(appointmentFromRow);
}

// 2-hour slots on a day for moving a job: includes ones inside the 24-hour
// notice window that customers can't book.
export async function loadSupplierSlots(supplierId: string, day: string): Promise<Slot[]> {
  const { data, error } = await supabase.rpc("supplier_slots", { p_supplier_id: supplierId, p_from: day, p_to: day });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({ start: r.slot_start, end: r.slot_end, free: !!r.free }));
}

// "2026-12-19" + "18:30" as a Queensland-time timestamp.
export function brisbaneIso(day: string, time: string): string {
  return `${day}T${time.length === 5 ? time : "00:00"}:00+10:00`;
}

// The day after a "YYYY-MM-DD" date.
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const timeParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const minute = get("minute");
  return `${get("hour")}${minute === "00" ? "" : `:${minute}`} ${get("dayPeriod").toLowerCase()}`;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Sat 19 Dec" for a timestamp's Queensland date.
export function dateHeading(iso: string): string {
  const [y, m, d] = slotDateKey(iso).split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${d} ${MONTH_SHORT[m - 1]}`;
}

// "1 pm – 3 pm", "6:30 pm – 8 pm"
export function timeRange(startIso: string, endIso: string): string {
  return `${timeParts(startIso)} – ${timeParts(endIso)}`;
}

export function holdLeft(heldUntil: string | null, now = Date.now()): string {
  if (!heldUntil) return "";
  const hours = Math.max(0, Math.round((new Date(heldUntil).getTime() - now) / 3600000));
  return hours >= 48 ? `${Math.round(hours / 24)} days left` : `${hours} hour${hours === 1 ? "" : "s"} left`;
}

async function run(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
}

export const blockTime = (supplierId: string, startIso: string, endIso: string, note: string) =>
  run("block_time", { p_supplier_id: supplierId, p_starts_at: startIso, p_ends_at: endIso, p_note: note });

export const releaseBlock = (appointmentId: string) => run("release_block", { p_appointment_id: appointmentId });

export const moveBooking = (requestId: string, newStartIso: string) =>
  run("move_booking", { p_request_id: requestId, p_new_start: newStartIso });

export const arrangeTime = (requestId: string, startIso: string, endIso: string) =>
  run("arrange_time", { p_request_id: requestId, p_start: startIso, p_end: endIso });
