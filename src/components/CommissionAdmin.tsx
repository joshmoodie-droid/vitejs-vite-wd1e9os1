// Admin "Commission" tab (M6): HoseQuote's fee on completed jobs, by month
// and supplier — invoice suppliers from the CSV, then mark the month
// invoiced. Plus each supplier's rate / minimum / maximum.

import { Fragment, useState } from "react";
import { Download, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge, inputClass } from "./ui";
import {
  monthsWithJobs, monthLabel, summariseMonth, inProgress, monthCsv, downloadCsv, rateFor,
  markInvoiced, setJobRate, saveSupplierRate, dollars, percent,
  type Commission, type CommissionSupplier, type SupplierRate,
} from "../lib/commission";

type Req = { id: string; name?: string };

export function CommissionAdmin({
  commissions, rates, suppliers, requests, onReload,
}: {
  commissions: Commission[];
  rates: Record<string, SupplierRate>;
  suppliers: CommissionSupplier[];
  requests: Req[];
  onReload: () => void | Promise<void>;
}) {
  const months = monthsWithJobs(commissions);
  const [month, setMonth] = useState(months[0]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const rows = summariseMonth(commissions, month);
  const pending = inProgress(commissions);
  const total = rows.reduce((t, r) => t + r.commission, 0);
  const value = rows.reduce((t, r) => t + r.jobValue, 0);
  const jobs = rows.reduce((t, r) => t + r.jobs.length, 0);
  const outstanding = rows.reduce((t, r) => t + r.commission - r.invoiced, 0);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.companyName ?? "Unknown supplier";
  const customerName = (requestId: string) => requests.find((r) => r.id === requestId)?.name ?? "";

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    setNote("");
    try {
      await fn();
      await onReload();
      setNote(done);
    } catch (e) {
      setNote(`Couldn't save: ${e instanceof Error ? e.message : "please try again"}`);
    } finally {
      setBusy("");
    }
  };

  const exportCsv = () =>
    downloadCsv(`hosequote-commission-${month}.csv`, monthCsv(rows, month, supplierName, customerName));

  const stat = (label: string, v: string, tone = "text-white") => (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
      <div className={`text-lg font-extrabold ${tone}`}>{v}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );

  return (
    <div>
      <p className="text-sm text-neutral-400 mb-4">
        HoseQuote's fee on each completed job. Invoice suppliers from the CSV, then mark the month invoiced.
        Nothing is charged automatically.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className={inputClass() + " max-w-[14rem]"} value={month} onChange={(e) => { setMonth(e.target.value); setOpen(null); }} aria-label="Month">
          {months.map((m) => <option className="bg-neutral-900 text-white" key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button onClick={exportCsv} disabled={jobs === 0} className="flex items-center gap-1.5 border border-neutral-700 hover:border-neutral-500 disabled:opacity-40 text-neutral-200 font-semibold text-sm px-3 py-2.5 rounded-lg">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {stat("jobs completed", String(jobs))}
        {stat("job value", dollars(value))}
        {stat("commission", dollars(total), "text-orange-400")}
        {stat("not invoiced yet", dollars(outstanding), outstanding > 0 ? "text-amber-400" : "text-emerald-400")}
      </div>

      {note && <p className="text-sm text-neutral-300 mb-3">{note}</p>}

      {rows.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-xl mb-6">
          No completed jobs in {monthLabel(month)}.
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {rows.map((r) => {
            const due = r.toInvoice.reduce((t, c) => t + c.amount, 0);
            const expanded = open === r.supplierId;
            return (
              <div key={r.supplierId} className="bg-neutral-900 border border-neutral-800 rounded-xl">
                <button onClick={() => setOpen(expanded ? null : r.supplierId)} className="w-full text-left p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-semibold flex items-center gap-1.5">
                      {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <span className="truncate">{supplierName(r.supplierId)}</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5 ml-5.5">
                      {r.jobs.length} job{r.jobs.length === 1 ? "" : "s"} · {dollars(r.jobValue)} job value
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-orange-400 font-bold">{dollars(r.commission)}</div>
                    {due > 0
                      ? <Badge tone="amber">{dollars(due)} to invoice</Badge>
                      : r.commission > 0 ? <Badge tone="green">Invoiced</Badge> : <Badge tone="neutral">No fee</Badge>}
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-4">
                    <div className="space-y-1.5 text-sm">
                      {r.jobs.map((q) => (
                        <div key={q.quoteId} className="bg-black/30 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono text-orange-400">{q.requestId}</span>
                            <span className="text-neutral-400"> · {customerName(q.requestId) || "—"}</span>
                            <div className="text-xs text-neutral-500">
                              {q.completedAt ? new Date(q.completedAt).toLocaleDateString("en-AU") : ""} · {dollars(q.jobValue)} × {percent(q.rate)}
                              {q.invoicedAt ? ` · invoiced ${new Date(q.invoicedAt).toLocaleDateString("en-AU")}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-semibold">{dollars(q.amount)}</span>
                            {!q.invoicedAt && (
                              q.rate > 0 ? (
                                <button
                                  disabled={!!busy} className="text-xs text-neutral-400 hover:text-white underline disabled:opacity-40"
                                  onClick={() => window.confirm(`Waive HoseQuote's fee on ${q.requestId}?`) && run(q.quoteId, () => setJobRate(q.quoteId, 0), `Fee on ${q.requestId} waived.`)}
                                >
                                  Waive
                                </button>
                              ) : (
                                <button
                                  disabled={!!busy} className="text-xs text-neutral-400 hover:text-white underline disabled:opacity-40"
                                  onClick={() => run(q.quoteId, () => setJobRate(q.quoteId, rateFor(rates, q.supplierId).rate), `Fee on ${q.requestId} charged at ${percent(rateFor(rates, q.supplierId).rate)}.`)}
                                >
                                  Charge
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {r.toInvoice.length > 0 && (
                      <button
                        disabled={!!busy}
                        onClick={() => run(r.supplierId, () => markInvoiced(r.toInvoice.map((c) => c.quoteId)), `${supplierName(r.supplierId)} — ${monthLabel(month)} marked invoiced (${dollars(due)}).`)}
                        className="mt-3 flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold text-sm px-3 py-2 rounded-lg"
                      >
                        <CheckCircle2 className="w-4 h-4" /> {busy === r.supplierId ? "Saving…" : `Mark ${dollars(due)} invoiced`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending.jobs.length > 0 && (
        <p className="text-sm text-neutral-400 mb-6">
          <span className="text-white font-semibold">{pending.jobs.length}</span> accepted job{pending.jobs.length === 1 ? "" : "s"} not completed yet
          · <span className="text-white font-semibold">{dollars(pending.commission)}</span> commission once done.
        </p>
      )}

      <h3 className="text-white font-bold text-lg mb-1">Supplier rates</h3>
      <p className="text-sm text-neutral-500 mb-3">
        Fee = rate × job value, between the minimum and maximum (never more than the job). A new rate applies to jobs accepted from now on;
        the minimum and maximum to any job not yet invoiced. Rate 0% = no fee.
      </p>
      <div className="space-y-2">
        {suppliers.map((s) => (
          <Fragment key={s.id}>
            <RateRow supplier={s} current={rateFor(rates, s.id)} busy={busy === `rate-${s.id}`} disabled={!!busy}
              onSave={(c) => run(`rate-${s.id}`, () => saveSupplierRate(s.id, c), `${s.companyName}: ${percent(c.rate)}, min ${dollars(c.min)}, max ${dollars(c.max)}.`)} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function RateRow({
  supplier, current, busy, disabled, onSave,
}: {
  supplier: CommissionSupplier;
  current: SupplierRate;
  busy: boolean;
  disabled: boolean;
  onSave: (c: SupplierRate) => void;
}) {
  const initial = { rate: String(+(current.rate * 100).toFixed(2)), min: String(current.min), max: String(current.max) };
  const [v, setV] = useState(initial);
  const dirty = v.rate !== initial.rate || v.min !== initial.min || v.max !== initial.max;
  const rate = Number(v.rate), min = Number(v.min), max = Number(v.max);
  const valid = v.rate !== "" && v.min !== "" && v.max !== "" && rate >= 0 && rate <= 100 && min >= 0 && max >= min;

  const box = (k: "rate" | "min" | "max", label: string) => (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      <input type="number" min="0" step={k === "rate" ? "0.5" : "1"} className={inputClass() + " !py-2"} value={v[k]}
        onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
    </label>
  );

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
      <div className="text-white font-semibold text-sm mb-2">{supplier.companyName}</div>
      <div className="grid grid-cols-3 gap-2 items-end">
        {box("rate", "Rate %")}
        {box("min", "Min $")}
        {box("max", "Max $")}
      </div>
      {dirty && (
        <div className="flex items-center gap-3 mt-2">
          <button disabled={!valid || disabled} onClick={() => onSave({ rate: rate / 100, min, max })}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-black font-bold text-sm px-3 py-1.5 rounded-lg">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setV(initial)} className="text-sm text-neutral-400 hover:text-white">Cancel</button>
          {!valid && <span className="text-xs text-red-400">Rate 0–100%, max ≥ min.</span>}
        </div>
      )}
    </div>
  );
}
