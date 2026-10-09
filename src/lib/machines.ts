// Maintenance register data layer: machines, their hose register, and the
// service log (tables from supabase/migrations/0012_maintenance_register.sql).
//
// Everything here runs as the signed-in customer; RLS limits every query to
// their own rows, and customer_id is filled in by the column default
// (auth.uid()), so callers never pass it.

import { supabase } from "../supabaseClient";
import { BORES } from "./catalog";
import { emptyAssembly } from "./forms";

export type Machine = {
  id: string;
  name: string;
  make: string;
  model: string;
  year: string; // kept as strings for the form; empty = not set
  serial: string;
  rego: string;
  hours: string;
  site: string;
  notes: string;
  createdAt: string;
};

// One hose on a machine. `spec` matches one entry of the quote form's
// `assemblies` (minus id/quantity), so it can be re-ordered later.
export type HoseSpec = {
  category: "hydraulic_oil" | "pressure_washer";
  hoseType: string;
  bore: string;
  length: string;
  pressure: string;
  fittingAType: string;
  fittingAOrientation: string;
  fittingBType: string;
  fittingBOrientation: string;
};

export type MachineHose = {
  id: string;
  machineId: string;
  position: string;
  spec: HoseSpec;
  installedAt: string;
  notes: string;
};

export const SERVICE_KINDS = [
  { key: "hose_replaced", label: "Hose replaced" },
  { key: "inspection", label: "Inspection" },
  { key: "service", label: "Service" },
  { key: "oil_filter", label: "Oil / filter change" },
  { key: "grease", label: "Greasing" },
  { key: "repair", label: "Repair" },
  { key: "other", label: "Other" },
] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number]["key"];

export type ServiceLogEntry = {
  id: string;
  machineId: string;
  kind: ServiceKind;
  performedAt: string;
  hours: string;
  cost: string;
  performedBy: string;
  notes: string;
};

export function serviceKindLabel(kind: string): string {
  return SERVICE_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

// ---------- empty records for "add" forms ----------

export function emptyMachine(): Omit<Machine, "id" | "createdAt"> {
  return { name: "", make: "", model: "", year: "", serial: "", rego: "", hours: "", site: "", notes: "" };
}

export function emptyHoseSpec(): HoseSpec {
  return {
    category: "hydraulic_oil", hoseType: "", bore: "", length: "", pressure: "",
    fittingAType: "", fittingAOrientation: "Straight", fittingBType: "", fittingBOrientation: "Straight",
  };
}

export function emptyHose(): Omit<MachineHose, "id" | "machineId"> {
  return { position: "", spec: emptyHoseSpec(), installedAt: "", notes: "" };
}

export function emptyLogEntry(): Omit<ServiceLogEntry, "id" | "machineId"> {
  return {
    kind: "service", performedAt: new Date().toISOString().slice(0, 10),
    hours: "", cost: "", performedBy: "", notes: "",
  };
}

// ---------- row <-> app mapping ----------

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const dateOrNull = (v: string) => (v === "" ? null : v);

type Row = Record<string, unknown>;

function machineFromRow(r: Row): Machine {
  return {
    id: str(r.id), name: str(r.name), make: str(r.make), model: str(r.model),
    year: str(r.year), serial: str(r.serial), rego: str(r.rego), hours: str(r.hours),
    site: str(r.site), notes: str(r.notes), createdAt: str(r.created_at),
  };
}

function machineToRow(m: Omit<Machine, "id" | "createdAt">) {
  return {
    name: m.name.trim(), make: textOrNull(m.make), model: textOrNull(m.model),
    year: numOrNull(m.year), serial: textOrNull(m.serial), rego: textOrNull(m.rego),
    hours: numOrNull(m.hours), site: textOrNull(m.site), notes: textOrNull(m.notes),
  };
}

function hoseFromRow(r: Row): MachineHose {
  return {
    id: str(r.id), machineId: str(r.machine_id), position: str(r.position),
    spec: { ...emptyHoseSpec(), ...((r.spec as Partial<HoseSpec>) || {}) },
    installedAt: str(r.installed_at), notes: str(r.notes),
  };
}

function hoseToRow(h: Omit<MachineHose, "id" | "machineId">) {
  return {
    position: h.position.trim(), spec: h.spec,
    installed_at: dateOrNull(h.installedAt), notes: textOrNull(h.notes),
  };
}

function logFromRow(r: Row): ServiceLogEntry {
  return {
    id: str(r.id), machineId: str(r.machine_id), kind: str(r.kind) as ServiceKind,
    performedAt: str(r.performed_at), hours: str(r.hours), cost: str(r.cost),
    performedBy: str(r.performed_by), notes: str(r.notes),
  };
}

function logToRow(e: Omit<ServiceLogEntry, "id" | "machineId">) {
  return {
    kind: e.kind, performed_at: e.performedAt, hours: numOrNull(e.hours),
    cost: numOrNull(e.cost), performed_by: textOrNull(e.performedBy), notes: textOrNull(e.notes),
  };
}

// Supabase returns { data, error } instead of throwing. Throw so callers can
// show one error message and never mistake a failed write for a success.
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- machines ----------

export async function listMachines(): Promise<Machine[]> {
  const rows = unwrap<Row[]>(await supabase.from("machines").select("*").order("name"));
  return rows.map(machineFromRow);
}

export async function createMachine(m: Omit<Machine, "id" | "createdAt">): Promise<Machine> {
  return machineFromRow(unwrap<Row>(await supabase.from("machines").insert(machineToRow(m)).select().single()));
}

export async function updateMachine(id: string, m: Omit<Machine, "id" | "createdAt">): Promise<Machine> {
  return machineFromRow(
    unwrap<Row>(await supabase.from("machines").update(machineToRow(m)).eq("id", id).select().single()),
  );
}

// Deletes the machine's hoses and log entries too (ON DELETE CASCADE).
export async function deleteMachine(id: string): Promise<void> {
  unwrap(await supabase.from("machines").delete().eq("id", id));
}

// ---------- hose register ----------

export async function listHoses(machineId: string): Promise<MachineHose[]> {
  const rows = unwrap<Row[]>(
    await supabase.from("machine_hoses").select("*").eq("machine_id", machineId).order("position"),
  );
  return rows.map(hoseFromRow);
}

// Optional links back to the HoseQuote job a register row came from.
export type JobLink = { requestId?: string; supplierId?: string | null };
const jobLinkToRow = (l?: JobLink) =>
  l ? { request_id: l.requestId ?? null, supplier_id: l.supplierId ?? null } : {};

export async function createHose(
  machineId: string,
  h: Omit<MachineHose, "id" | "machineId">,
  link?: JobLink,
): Promise<MachineHose> {
  return hoseFromRow(
    unwrap<Row>(
      await supabase
        .from("machine_hoses")
        .insert({ ...hoseToRow(h), ...jobLinkToRow(link), machine_id: machineId })
        .select()
        .single(),
    ),
  );
}

export async function updateHose(id: string, h: Omit<MachineHose, "id" | "machineId">): Promise<MachineHose> {
  return hoseFromRow(
    unwrap<Row>(await supabase.from("machine_hoses").update(hoseToRow(h)).eq("id", id).select().single()),
  );
}

export async function deleteHose(id: string): Promise<void> {
  unwrap(await supabase.from("machine_hoses").delete().eq("id", id));
}

// ---------- service log ----------

export async function listLog(machineId: string): Promise<ServiceLogEntry[]> {
  const rows = unwrap<Row[]>(
    await supabase
      .from("service_log")
      .select("*")
      .eq("machine_id", machineId)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false }),
  );
  return rows.map(logFromRow);
}

export async function createLogEntry(
  machineId: string,
  e: Omit<ServiceLogEntry, "id" | "machineId">,
  link?: JobLink,
): Promise<ServiceLogEntry> {
  return logFromRow(
    unwrap<Row>(
      await supabase
        .from("service_log")
        .insert({ ...logToRow(e), ...jobLinkToRow(link), machine_id: machineId })
        .select()
        .single(),
    ),
  );
}

// Request ids that already have hoses saved in the customer's register, so a
// past job isn't offered "Save to a machine" twice.
export async function listSavedRequestIds(): Promise<Set<string>> {
  const rows = unwrap<Row[]>(
    await supabase.from("machine_hoses").select("request_id").not("request_id", "is", null),
  );
  return new Set(rows.map((r) => str(r.request_id)));
}

export async function updateLogEntry(id: string, e: Omit<ServiceLogEntry, "id" | "machineId">): Promise<ServiceLogEntry> {
  return logFromRow(
    unwrap<Row>(await supabase.from("service_log").update(logToRow(e)).eq("id", id).select().single()),
  );
}

export async function deleteLogEntry(id: string): Promise<void> {
  unwrap(await supabase.from("service_log").delete().eq("id", id));
}

// ---------- display helpers ----------

// e.g. '1/2" (13mm) 2-wire braid (SAE 100R2), 1.2 m, BSP Female → JIC 37° Male'
export function describeHoseSpec(s: HoseSpec): string {
  const parts: string[] = [];
  const size = (BORES as Record<string, { key: string; label: string }[]>)[s.category]
    ?.find((b) => b.key === s.bore)?.label;
  const head = [size, s.hoseType].filter(Boolean).join(" ");
  if (head) parts.push(head);
  if (s.length) parts.push(`${s.length} m`);
  const fittings = [s.fittingAType, s.fittingBType].filter(Boolean);
  if (fittings.length) parts.push(fittings.join(" → "));
  return parts.join(", ") || "No spec recorded";
}

// ---------- quote-form prefill ("Order again" / "Get a quote") ----------

// Partial quote-form state. App.startPrefilledQuote merges it over a blank form.
export type QuotePrefill = {
  machineId?: string;
  assemblies?: Record<string, unknown>[];
  location?: string;
  selectedSupplierId?: string;
  fulfillment?: string;
  deliveryAddress?: string;
};

// A saved hose as a quote-form assembly. machineHoseId lets the completion
// trigger update this hose in the register instead of adding a new one.
export function assemblyFromHose(h: MachineHose): Record<string, unknown> {
  return { ...emptyAssembly(), ...h.spec, quantity: 1, machineHoseId: h.id };
}

// A past request's assemblies, re-keyed so the form treats them as new rows.
export function assembliesFromRequest(assemblies: unknown): Record<string, unknown>[] {
  if (!Array.isArray(assemblies) || assemblies.length === 0) return [emptyAssembly()];
  return assemblies.map((a) => ({ ...(a as Record<string, unknown>), id: emptyAssembly().id }));
}

// Spec to store in the register from a quote-form assembly.
export function hoseSpecFromAssembly(a: Record<string, unknown>): HoseSpec {
  const spec = { ...emptyHoseSpec() } as Record<string, unknown>;
  for (const k of Object.keys(spec)) if (a[k] !== undefined && a[k] !== null) spec[k] = String(a[k]);
  return spec as HoseSpec;
}
