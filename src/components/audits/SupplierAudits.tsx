// "Audits" tab: customer bookings and supplier-started audits, split into
// open and done, plus "New audit" for any customer. Used by the supplier
// portal (one supplier) and the admin portal (every supplier: pass no
// supplierId, plus the supplier list — adds a supplier filter and picker).

import { useEffect, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { Badge, Field, inputClass } from "../ui";
import { AuditEditor } from "./AuditEditor";
import {
  listAudits, createAudit, auditStatusInfo, auditTotal, money,
  type Audit, type AuditDraft,
} from "../../lib/audits";

const when = (iso: string) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

// Full supplier pricing (lib/rows): audit fees for new audits, the rest for
// quotes made from an audit.
type Pricing = { auditFee?: number; auditFeePerMachine?: number } & Record<string, any>;
type SupplierRef = { id: string; companyName: string };

export function SupplierAudits({
  supplierId, userId, pricing, suppliers, pricingBySupplier, onQuoteCreated,
}: {
  supplierId?: string;
  userId: string;
  pricing?: Pricing;
  suppliers?: SupplierRef[];
  pricingBySupplier?: Record<string, Pricing>;
  onQuoteCreated?: () => void;
}) {
  const admin = !supplierId;
  const [audits, setAudits] = useState<Audit[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState(""); // admin: "" = all suppliers

  useEffect(() => {
    let cancelled = false;
    listAudits()
      .then((a) => { if (!cancelled) setAudits(admin ? a : a.filter((x) => x.supplierId === supplierId)); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [supplierId, admin]);

  const supplierName = (id: string) => suppliers?.find((x) => x.id === id)?.companyName ?? "Unknown supplier";

  const open = audits?.find((a) => a.id === openId);
  if (open) {
    return (
      <AuditEditor
        audit={open} userId={userId} onBack={() => setOpenId(null)}
        pricing={pricing ?? pricingBySupplier?.[open.supplierId]} onQuoteCreated={onQuoteCreated}
        onUpdated={(a) => setAudits((as) => (as || []).map((x) => (x.id === a.id ? a : x)))}
      />
    );
  }

  const shown = (audits || []).filter((a: Audit) => !filter || a.supplierId === filter);
  const active = shown.filter((a: Audit) => a.status !== "completed" && a.status !== "cancelled");
  const done = shown.filter((a: Audit) => a.status === "completed" || a.status === "cancelled");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        {admin ? (
          <select className={inputClass() + " max-w-xs"} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by supplier">
            <option className="bg-neutral-900 text-white" value="">All suppliers</option>
            {(suppliers || []).map((x) => <option className="bg-neutral-900 text-white" key={x.id} value={x.id}>{x.companyName}</option>)}
          </select>
        ) : (
          <p className="text-sm text-neutral-400">Inspect a customer's hoses, photograph them, and recommend what to replace.</p>
        )}
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg shrink-0">
            <Plus className="w-4 h-4" /> New audit
          </button>
        )}
      </div>

      {creating && (
        <NewAuditForm
          pricing={pricing}
          suppliers={admin ? suppliers : undefined}
          pricingBySupplier={pricingBySupplier}
          initialSupplierId={filter}
          onCancel={() => setCreating(false)}
          onSave={async (d, forSupplierId) => {
            const created = await createAudit(supplierId ?? forSupplierId, d);
            setAudits((as) => [created, ...(as || [])]);
            setCreating(false);
            setOpenId(created.id);
          }}
        />
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {audits === null && !error && <p className="text-neutral-500">Loading…</p>}

      {audits && (
        <>
          <AuditList title="Open" list={active} empty="No open audits. Customer bookings appear here." onOpen={setOpenId} supplierName={admin ? supplierName : undefined} />
          <AuditList title="Completed" list={done} empty="No completed audits yet." onOpen={setOpenId} supplierName={admin ? supplierName : undefined} />
        </>
      )}
    </div>
  );
}

function AuditList({
  title, list, empty, onOpen, supplierName,
}: {
  title: string; list: Audit[]; empty: string; onOpen: (id: string) => void;
  supplierName?: (id: string) => string; // admin view: show whose audit it is
}) {
  return (
    <div className="mb-6">
      <div className="text-neutral-400 text-xs font-bold uppercase tracking-wide mb-2">{title} ({list.length})</div>
      {list.length === 0 && <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-800 rounded-xl text-sm">{empty}</div>}
      <div className="space-y-2">
        {list.map((a) => {
          const s = auditStatusInfo(a.status);
          return (
            <button
              key={a.id} onClick={() => onOpen(a.id)}
              className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-4 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-semibold">{a.customerName}</span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {a.source === "customer" && <span className="text-xs text-neutral-500">booked in app</span>}
                </div>
                {supplierName && <div className="text-xs text-orange-400 mt-0.5">{supplierName(a.supplierId)}</div>}
                <div className="text-sm text-neutral-400 mt-0.5">
                  {[a.location || a.siteAddress, a.scheduledFor && `on ${when(a.scheduledFor)}`, money(auditTotal(a))].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-600 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewAuditForm({
  pricing, suppliers, pricingBySupplier, initialSupplierId = "", onSave, onCancel,
}: {
  pricing?: Pricing;
  suppliers?: SupplierRef[]; // admin: choose which supplier the audit is for
  pricingBySupplier?: Record<string, Pricing>;
  initialSupplierId?: string;
  onSave: (d: AuditDraft, supplierId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [forSupplier, setForSupplier] = useState(initialSupplierId);
  const [supplierError, setSupplierError] = useState("");
  const start = pricing ?? pricingBySupplier?.[initialSupplierId];
  const [d, setD] = useState<AuditDraft>({
    customerName: "", customerEmail: "", customerPhone: "", location: "", siteAddress: "", scheduledFor: "",
    auditFee: String(start?.auditFee ?? 150), perMachineFee: String(start?.auditFeePerMachine ?? 0),
    summary: "", status: "scheduled",
  });
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof AuditDraft) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  // Admin picking a supplier: start from that supplier's audit fees.
  const pickSupplier = (id: string) => {
    setForSupplier(id);
    setSupplierError("");
    const p = pricingBySupplier?.[id];
    if (p) setD((x) => ({ ...x, auditFee: String(p.auditFee ?? 150), perMachineFee: String(p.auditFeePerMachine ?? 0) }));
  };

  const submit = async () => {
    if (suppliers && !forSupplier) { setSupplierError("Choose the supplier doing the audit."); return; }
    if (!d.customerName.trim()) { setNameError("Who is the audit for?"); return; }
    setNameError("");
    setSaving(true);
    setError("");
    try {
      await onSave(d, forSupplier);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the audit — please try again.");
      setSaving(false);
    }
  };

  return (
    <form className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 mb-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h3 className="text-white font-bold text-lg mb-1">New hose audit</h3>
      <p className="text-neutral-500 text-sm mb-4">For any customer. If their email matches a HoseQuote account, they'll see the audit there.</p>
      {suppliers && (
        <Field label="Supplier doing the audit" required error={supplierError}>
          <select className={inputClass(supplierError)} value={forSupplier} onChange={(e) => pickSupplier(e.target.value)}>
            <option className="bg-neutral-900 text-white" value="">Choose…</option>
            {suppliers.map((x) => <option className="bg-neutral-900 text-white" key={x.id} value={x.id}>{x.companyName}</option>)}
          </select>
        </Field>
      )}
      <Field label="Customer / business name" required error={nameError}>
        <input className={inputClass(nameError)} value={d.customerName} onChange={set("customerName")} autoFocus={!suppliers} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" hint="Where the report goes.">
          <input type="email" className={inputClass()} value={d.customerEmail} onChange={set("customerEmail")} />
        </Field>
        <Field label="Phone">
          <input className={inputClass()} value={d.customerPhone} onChange={set("customerPhone")} />
        </Field>
        <Field label="Suburb / postcode">
          <input className={inputClass()} value={d.location} onChange={set("location")} />
        </Field>
        <Field label="Scheduled for">
          <input type="date" className={inputClass()} value={d.scheduledFor} onChange={set("scheduledFor")} />
        </Field>
      </div>
      <Field label="Site address">
        <input className={inputClass()} value={d.siteAddress} onChange={set("siteAddress")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Audit fee ($)"><input type="number" min="0" className={inputClass()} value={d.auditFee} onChange={set("auditFee")} /></Field>
        <Field label="Per machine ($)"><input type="number" min="0" className={inputClass()} value={d.perMachineFee} onChange={set("perMachineFee")} /></Field>
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-5 py-2.5 rounded-lg">
          {saving ? "Creating…" : "Create audit"}
        </button>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold px-3">Cancel</button>
      </div>
    </form>
  );
}
