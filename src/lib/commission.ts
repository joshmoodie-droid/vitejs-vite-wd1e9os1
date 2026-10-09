// HoseQuote's commission on accepted jobs (migration 0021). The database
// keeps one `commissions` row per job; this loads them, groups completed
// jobs by month and supplier for the admin's monthly invoicing, and saves
// admin changes.

import { supabase } from "../supabaseClient";

export type Commission = {
  quoteId: string; supplierId: string; requestId: string; status: "accepted" | "completed";
  acceptedAt: string; completedAt: string | null; jobValue: number; rate: number; amount: number;
  invoicedAt: string | null;
};
export type SupplierRate = { rate: number; min: number; max: number };
export type CommissionSupplier = { id: string; companyName: string };

export const DEFAULT_COMMISSION = { rate: 0.08, min: 5, max: 50 };

type Row = Record<string, any>;

export function commissionFromRow(r: Row): Commission {
  return {
    quoteId: r.quote_id, supplierId: r.supplier_id, requestId: r.request_id, status: r.status,
    acceptedAt: r.accepted_at, completedAt: r.completed_at ?? null, jobValue: Number(r.job_value) || 0,
    rate: Number(r.rate) || 0, amount: Number(r.amount) || 0, invoicedAt: r.invoiced_at ?? null,
  };
}

// Readable by an admin (all) and each supplier (their own); RLS returns
// nothing to anyone else. Before migration 0021 the tables don't exist —
// treat that as "no commission data".
export async function loadCommissions(): Promise<{ commissions: Commission[]; rates: Record<string, SupplierRate> }> {
  const [{ data: rows }, { data: rateRows }] = await Promise.all([
    supabase.from("commissions").select("*"),
    supabase.from("supplier_commission").select("*"),
  ]);
  const rates: Record<string, SupplierRate> = {};
  for (const r of (rateRows as Row[]) || []) rates[r.supplier_id] = { rate: Number(r.rate), min: Number(r.min_fee), max: Number(r.max_fee) };
  return { commissions: ((rows as Row[]) || []).map(commissionFromRow), rates };
}

export const rateFor = (rates: Record<string, SupplierRate>, supplierId: string): SupplierRate =>
  rates[supplierId] ?? DEFAULT_COMMISSION;

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);

// "2026-10" in the viewer's local time (the admin is in Australia).
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export const dollars = (v: number) =>
  `$${v.toLocaleString("en-AU", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const percent = (rate: number | null) => `${+(n(rate) * 100).toFixed(2)}%`;

// A job counts towards the month it was completed in.
export const isChargeable = (c: Commission) => c.status === "completed" && !!c.completedAt;

export function monthsWithJobs(list: Commission[]): string[] {
  const now = monthKey(new Date().toISOString());
  const keys = new Set<string>([now]);
  list.filter(isChargeable).forEach((c) => keys.add(monthKey(c.completedAt!)));
  return [...keys].sort().reverse();
}

export type SupplierMonth = {
  supplierId: string;
  jobs: Commission[];
  jobValue: number;
  commission: number;
  invoiced: number; // commission already marked invoiced
  toInvoice: Commission[]; // jobs with a fee not yet invoiced
};

export function summariseMonth(list: Commission[], month: string): SupplierMonth[] {
  const bySupplier = new Map<string, SupplierMonth>();
  for (const c of list) {
    if (!isChargeable(c) || monthKey(c.completedAt!) !== month) continue;
    const row = bySupplier.get(c.supplierId) ?? { supplierId: c.supplierId, jobs: [], jobValue: 0, commission: 0, invoiced: 0, toInvoice: [] };
    row.jobs.push(c);
    row.jobValue += c.jobValue;
    row.commission += c.amount;
    if (c.invoicedAt) row.invoiced += c.amount;
    else if (c.amount > 0) row.toInvoice.push(c);
    bySupplier.set(c.supplierId, row);
  }
  return [...bySupplier.values()].sort((a, b) => b.commission - a.commission);
}

// Accepted but not yet completed: what will fall due once the work is done.
export function inProgress(list: Commission[]) {
  const jobs = list.filter((c) => c.status === "accepted");
  return { jobs, commission: jobs.reduce((t, c) => t + c.amount, 0) };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// One line per completed job in the month, for invoicing.
export function monthCsv(
  rows: SupplierMonth[], month: string, supplierName: (id: string) => string,
  customerName: (requestId: string) => string,
): string {
  const lines = [["Month", "Supplier", "Job", "Customer", "Completed", "Job value", "Rate", "Commission", "Invoiced"]];
  for (const r of rows) {
    for (const c of r.jobs) {
      lines.push([
        month, supplierName(r.supplierId), c.requestId, customerName(c.requestId),
        c.completedAt ? new Date(c.completedAt).toLocaleDateString("en-AU") : "",
        c.jobValue.toFixed(2), percent(c.rate), c.amount.toFixed(2),
        c.invoicedAt ? new Date(c.invoicedAt).toLocaleDateString("en-AU") : "",
      ]);
    }
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function check({ error }: { error: { message: string } | null }) {
  if (error) throw new Error(error.message);
}

// ---------- admin writes (RLS: admin only) ----------

export async function markInvoiced(quoteIds: string[]): Promise<void> {
  if (quoteIds.length === 0) return;
  check(await supabase.from("commissions").update({ invoiced_at: new Date().toISOString() }).in("quote_id", quoteIds));
}

// Waive (rate 0) or restore one job's fee; the amount is recalculated.
export async function setJobRate(quoteId: string, rate: number): Promise<void> {
  check(await supabase.from("commissions").update({ rate }).eq("quote_id", quoteId));
}

export async function saveSupplierRate(supplierId: string, r: SupplierRate): Promise<void> {
  check(await supabase.from("supplier_commission").upsert({
    supplier_id: supplierId, rate: r.rate, min_fee: r.min, max_fee: r.max, updated_at: new Date().toISOString(),
  }));
}
