// Supplier hose audits (migration 0016). Customers book one with book_audit();
// suppliers create, perform and complete them. RLS decides who sees what:
// the supplier their own audits, the customer the audits linked to them.

import { supabase } from "../supabaseClient";
import { photoPaths } from "./photos";
import { emptyHoseSpec, type HoseSpec } from "./machines";
import type { Condition } from "./checks";

export const AUDIT_STATUSES = [
  { key: "requested", label: "Requested", tone: "amber" },
  { key: "scheduled", label: "Scheduled", tone: "orange" },
  { key: "in_progress", label: "In progress", tone: "orange" },
  { key: "completed", label: "Completed", tone: "green" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number]["key"];
export const auditStatusInfo = (s: string) => AUDIT_STATUSES.find((x) => x.key === s) ?? AUDIT_STATUSES[0];

export const AUDIT_ACTIONS = [
  { key: "replace_now", label: "Replace now" },
  { key: "replace_next_service", label: "Replace at next service" },
  { key: "monitor", label: "Monitor" },
  { key: "none", label: "No action needed" },
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number]["key"];
export const auditActionLabel = (a: string) => AUDIT_ACTIONS.find((x) => x.key === a)?.label ?? a;

export type Audit = {
  id: string;
  supplierId: string;
  source: "customer" | "supplier";
  status: AuditStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  location: string;
  siteAddress: string;
  machinesCount: string;
  preferredTime: string;
  notes: string;
  scheduledFor: string;
  auditFee: string;
  perMachineFee: string;
  summary: string;
  completedAt: string;
  createdAt: string;
  accessToken: string; // key for the customer's report link
  reportSentAt: string;
};

export type AuditItem = {
  id: string;
  auditId: string;
  machineLabel: string;
  position: string;
  spec: HoseSpec;
  condition: Condition;
  action: AuditAction;
  recommendation: string;
  photos: string[];
};

// Fields a supplier edits on an audit.
export type AuditDraft = Pick<
  Audit,
  | "customerName" | "customerEmail" | "customerPhone" | "location" | "siteAddress" | "scheduledFor"
  | "auditFee" | "perMachineFee" | "summary" | "status"
>;
export type AuditItemDraft = Omit<AuditItem, "id" | "auditId">;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

function auditFromRow(r: Row): Audit {
  return {
    id: str(r.id), supplierId: str(r.supplier_id), source: str(r.source) as Audit["source"],
    status: str(r.status) as AuditStatus, customerName: str(r.customer_name), customerEmail: str(r.customer_email),
    customerPhone: str(r.customer_phone), location: str(r.location), siteAddress: str(r.site_address),
    machinesCount: str(r.machines_count), preferredTime: str(r.preferred_time), notes: str(r.notes),
    scheduledFor: str(r.scheduled_for), auditFee: str(r.audit_fee), perMachineFee: str(r.per_machine_fee),
    summary: str(r.summary), completedAt: str(r.completed_at), createdAt: str(r.created_at),
    accessToken: str(r.access_token), reportSentAt: str(r.report_sent_at),
  };
}

function auditDraftToRow(d: AuditDraft) {
  return {
    customer_name: d.customerName.trim(), customer_email: textOrNull(d.customerEmail),
    customer_phone: textOrNull(d.customerPhone), location: textOrNull(d.location),
    site_address: textOrNull(d.siteAddress), scheduled_for: d.scheduledFor || null,
    audit_fee: Number(d.auditFee || 0), per_machine_fee: Number(d.perMachineFee || 0),
    summary: textOrNull(d.summary), status: d.status,
  };
}

function itemFromRow(r: Row): AuditItem {
  return {
    id: str(r.id), auditId: str(r.audit_id), machineLabel: str(r.machine_label), position: str(r.position),
    spec: { ...emptyHoseSpec(), ...((r.spec as Partial<HoseSpec>) || {}) },
    condition: str(r.condition) as Condition, action: str(r.action) as AuditAction,
    recommendation: str(r.recommendation), photos: photoPaths(r.photos),
  };
}

function itemDraftToRow(d: AuditItemDraft) {
  return {
    machine_label: d.machineLabel.trim(), position: d.position.trim(), spec: d.spec,
    condition: d.condition, action: d.action, recommendation: textOrNull(d.recommendation), photos: d.photos,
  };
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function emptyAuditItem(machineLabel = ""): AuditItemDraft {
  return { machineLabel, position: "", spec: emptyHoseSpec(), condition: "ok", action: "none", recommendation: "", photos: [] };
}

// ---------- audits ----------

export async function listAudits(): Promise<Audit[]> {
  const rows = unwrap<Row[]>(await supabase.from("audits").select("*").order("created_at", { ascending: false }));
  return rows.map(auditFromRow);
}

// Supplier-created audit. customer_id is linked by email server-side.
export async function createAudit(supplierId: string, d: AuditDraft): Promise<Audit> {
  return auditFromRow(
    unwrap<Row>(
      await supabase.from("audits").insert({ ...auditDraftToRow(d), supplier_id: supplierId, source: "supplier" }).select().single(),
    ),
  );
}

export async function updateAudit(id: string, d: AuditDraft & { completedAt?: string }): Promise<Audit> {
  const row: Record<string, unknown> = auditDraftToRow(d);
  // completed_at follows the status: kept once set, set when first completed,
  // cleared if the audit is reopened.
  row.completed_at = d.status === "completed" ? d.completedAt || new Date().toISOString() : null;
  return auditFromRow(unwrap<Row>(await supabase.from("audits").update(row).eq("id", id).select().single()));
}

export async function deleteAudit(id: string): Promise<void> {
  unwrap(await supabase.from("audits").delete().eq("id", id));
}

// Customer booking: the fee is taken from the supplier's pricing server-side.
export async function bookAudit(b: {
  supplierId: string; location: string; siteAddress: string; machinesCount: number;
  preferredTime: string; phone: string; notes: string;
}): Promise<string> {
  return unwrap<string>(
    await supabase.rpc("book_audit", {
      p_supplier_id: b.supplierId, p_location: b.location, p_site_address: b.siteAddress,
      p_machines_count: b.machinesCount, p_preferred_time: b.preferredTime, p_phone: b.phone, p_notes: b.notes,
    }),
  );
}

// ---------- items ----------

export async function listAuditItems(auditId: string): Promise<AuditItem[]> {
  const rows = unwrap<Row[]>(
    await supabase.from("audit_items").select("*").eq("audit_id", auditId)
      .order("machine_label").order("created_at"),
  );
  return rows.map(itemFromRow);
}

export async function createAuditItem(auditId: string, d: AuditItemDraft): Promise<AuditItem> {
  return itemFromRow(
    unwrap<Row>(await supabase.from("audit_items").insert({ ...itemDraftToRow(d), audit_id: auditId }).select().single()),
  );
}

export async function updateAuditItem(id: string, d: AuditItemDraft): Promise<AuditItem> {
  return itemFromRow(unwrap<Row>(await supabase.from("audit_items").update(itemDraftToRow(d)).eq("id", id).select().single()));
}

export async function deleteAuditItem(id: string): Promise<void> {
  unwrap(await supabase.from("audit_items").delete().eq("id", id));
}

// ---------- fee ----------

// Flat fee + per-machine fee × machines audited (distinct machine labels on
// the items; before any items exist, the customer's estimate from booking).
export function auditTotal(a: Pick<Audit, "auditFee" | "perMachineFee" | "machinesCount">, items?: AuditItem[]): number {
  const machines = items && items.length > 0
    ? new Set(items.map((i) => i.machineLabel.trim().toLowerCase())).size
    : Number(a.machinesCount || 0);
  return Number(a.auditFee || 0) + Number(a.perMachineFee || 0) * machines;
}

export const money = (n: number) => `A$${n.toFixed(2).replace(/\.00$/, "")}`;

// ---------- report (Edge Function: supabase/functions/audit-report) ----------

// The customer's report link — works without signing in.
export const auditReportPath = (a: Pick<Audit, "id" | "accessToken">) => `/a/${a.id}?t=${a.accessToken}`;

export type AuditReport = {
  audit: {
    id: string; status: AuditStatus; customerName: string; siteAddress: string | null; location: string | null;
    scheduledFor: string | null; completedAt: string | null; summary: string | null;
    auditFee: number; perMachineFee: number; total: number;
  };
  supplier: { name: string; email: string | null; phone: string | null } | null;
  items: {
    id: string; machineLabel: string; position: string; condition: Condition; action: AuditAction;
    recommendation: string | null; spec: Partial<HoseSpec>; photos: string[]; // signed URLs
  }[];
};

// supabase.functions.invoke reports non-2xx as an error whose body holds our
// { error } message — surface that rather than a generic status line.
async function invokeAuditReport<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("audit-report", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return data as T;
}

export function fetchAuditReport(id: string, token: string): Promise<AuditReport> {
  return invokeAuditReport<AuditReport>({ action: "view", id, token });
}

// Email the customer their report link (audit's supplier or an admin only).
export function sendAuditReport(id: string): Promise<{ sent: boolean; to: string }> {
  return invokeAuditReport({ action: "send", id });
}
