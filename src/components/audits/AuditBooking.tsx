// "Book a hose audit": a signed-in customer picks a supplier in their area,
// says where and roughly how many machines, and books. The fee shown comes
// from each supplier's pricing; book_audit() copies it server-side. Like the
// quote flow, suppliers stay anonymous ("Supplier 1") until they confirm.

import { useState } from "react";
import { ArrowLeft, ClipboardCheck, CheckCircle2, MapPin } from "lucide-react";
import { Field, inputClass } from "../ui";
import { areasMatch } from "../../lib/util";
import { bookAudit, money } from "../../lib/audits";

type Supplier = { id: string; serviceArea?: string };
type Pricing = { auditFee?: number; auditFeePerMachine?: number };

export function AuditBooking({
  customer, profile, suppliers, pricingBySupplier, onBack, onSignIn, onDone,
}: {
  customer: { id: string; email?: string } | null;
  profile: { phone?: string } | null;
  suppliers: Supplier[];
  pricingBySupplier: Record<string, Pricing>;
  onBack: () => void;
  onSignIn: () => void;
  onDone: () => void;
}) {
  const [location, setLocation] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [machines, setMachines] = useState("1");
  const [preferredTime, setPreferredTime] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(false);

  // A field's error disappears as soon as the customer edits that field.
  const clear = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  const count = Math.max(1, parseInt(machines) || 1);
  const options = location.trim()
    ? suppliers.filter((s) => areasMatch(location, s.serviceArea) && pricingBySupplier[s.id])
    : [];
  const fee = (id: string) => {
    const p = pricingBySupplier[id] ?? {};
    const base = p.auditFee ?? 150;
    const per = p.auditFeePerMachine ?? 0;
    return { base, per, total: base + per * count };
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!location.trim()) e.location = "Enter a suburb or postcode.";
    if (!siteAddress.trim()) e.siteAddress = "Enter where the machines are.";
    if (!supplierId) e.supplierId = "Choose a supplier.";
    if (!phone.trim()) e.phone = "Add a phone number so the supplier can arrange a time.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError("");
    try {
      await bookAudit({ supplierId, location, siteAddress, machinesCount: count, preferredTime, phone, notes });
      setBooked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't book the audit — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <>
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <ClipboardCheck className="w-3.5 h-3.5" /> Hose Audit
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Book a Hose Audit</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">
          A supplier checks the hoses on your machines, photographs any of concern, and recommends which
          ones to replace now, which can wait, and which are fine — so you can plan ahead before anything bursts.
        </p>
      </div>
    </>
  );

  if (!customer) {
    return (
      <div>
        {header}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
          <p className="text-neutral-300 mb-4">Sign in to book an audit — the results go straight into your maintenance register.</p>
          <button onClick={onSignIn} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-5 py-2.5 rounded-lg">Sign in</button>
        </div>
      </div>
    );
  }

  if (booked) {
    return (
      <div>
        {header}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-white font-bold text-xl mb-1">Audit requested</h2>
          <p className="text-neutral-400 mb-5">The supplier will contact you on {phone} to arrange a time. You can track it under My requests.</p>
          <button onClick={onDone} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-5 py-2.5 rounded-lg">Go to My requests</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        <Field label="Suburb or postcode" required error={errors.location}>
          <div className="relative">
            <MapPin className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder="e.g. Maroochydore or 4558" className={inputClass(errors.location) + " pl-10"}
              value={location} onChange={(e) => { setLocation(e.target.value); setSupplierId(""); clear("location"); }}
            />
          </div>
        </Field>
        <Field label="Site address" required error={errors.siteAddress} hint="Where the machines will be for the audit.">
          <input className={inputClass(errors.siteAddress)} value={siteAddress} onChange={(e) => { setSiteAddress(e.target.value); clear("siteAddress"); }} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="How many machines?" hint="Roughly — for the price estimate.">
            <input type="number" min="1" className={inputClass()} value={machines} onChange={(e) => setMachines(e.target.value)} />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <input className={inputClass(errors.phone)} value={phone} onChange={(e) => { setPhone(e.target.value); clear("phone"); }} placeholder="e.g. 0412 345 678" />
          </Field>
        </div>
        <Field label="Preferred date / time">
          <input className={inputClass()} value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} placeholder="e.g. Any weekday morning" />
        </Field>
        <Field label="Notes (optional)" hint="Machine types, access, known problem hoses…">
          <textarea rows={3} className={inputClass()} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {location.trim() && (
        <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-6 mb-6">
          <div className="text-white font-bold mb-1">Choose a supplier</div>
          <p className="text-xs text-neutral-500 mb-3">Audit fees are set by each supplier and paid to them directly. Names appear once they confirm.</p>
          {options.length === 0 && <p className="text-sm text-neutral-400">No suppliers cover that area yet.</p>}
          <div className="space-y-2">
            {options.map((s, idx) => {
              const f = fee(s.id);
              const selected = supplierId === s.id;
              return (
                <button
                  key={s.id} type="button" onClick={() => { setSupplierId(s.id); clear("supplierId"); }}
                  className={`w-full rounded-lg px-4 py-3 border text-left transition-colors ${selected ? "border-orange-500 bg-orange-500/10" : "border-transparent bg-black/30 hover:border-neutral-700"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${selected ? "text-orange-500" : "text-neutral-300"}`}>{selected && "✓ "}Supplier {idx + 1}</span>
                    <span className="text-white font-bold">{money(f.total)}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {money(f.base)} audit fee{f.per > 0 ? ` + ${money(f.per)} per machine × ${count}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
          {errors.supplierId && <p className="text-xs text-red-400 mt-2">{errors.supplierId}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
      <button
        onClick={submit} disabled={saving}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-6 py-3 rounded-lg"
      >
        {saving ? "Booking…" : "Book hose audit"}
      </button>
    </div>
  );
}
