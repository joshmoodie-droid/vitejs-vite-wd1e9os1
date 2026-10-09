// "Create quote from audit": the supplier ticks the audited hoses to
// replace and prices the job — hose assemblies only (pickup / delivery) or
// with on-site installation. Becomes a confirmed quote the customer is
// emailed and accepts like any other (create_quote_from_audit, 0019).

import { useState } from "react";
import { FileText, X } from "lucide-react";
import { Badge, Field, inputClass } from "../ui";
import { conditionInfo } from "../../lib/checks";
import { describeHoseSpec } from "../../lib/machines";
import { calcEstimate } from "../../lib/pricing";
import { auditActionLabel, createQuoteFromAudit, money, type Audit, type AuditItem } from "../../lib/audits";

// Supplier pricing as loaded by App (lib/rows pricingFromRow).
type Pricing = Record<string, any>;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const toReplace = (i: AuditItem) => i.action === "replace_now" || i.action === "replace_next_service";

// Hose + fittings + make-up labour + crimping at the supplier's rates, for the
// hoses whose spec is complete enough to price.
function estimateHoses(items: AuditItem[], pricing?: Pricing) {
  if (!pricing || items.length === 0) return { price: null as number | null, priced: 0 };
  const est = calcEstimate(
    { assemblies: items.map((i) => ({ ...i.spec, quantity: 1 })), urgency: "standard", fieldServiceRequested: false, fulfillment: "pickup" },
    pricing,
  );
  if (!est) return { price: null, priced: 0 };
  return { price: Math.round(est.hoseCost + est.fittingCost + est.labour + est.crimp), priced: est.assemblyCount };
}

export function AuditQuoteForm({
  audit, items, pricing, onCancel, onCreated,
}: {
  audit: Audit;
  items: AuditItem[];
  pricing?: Pricing;
  onCancel: () => void;
  onCreated: (requestId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => {
    const replace = items.filter(toReplace).map((i) => i.id);
    return replace.length ? replace : items.map((i) => i.id);
  });
  const chosen = items.filter((i) => picked.includes(i.id));
  const estimate = estimateHoses(chosen, pricing);

  const [onSite, setOnSite] = useState(false);
  const [hosesPrice, setHosesPrice] = useState(estimate.price != null ? String(estimate.price) : "");
  const [priceTouched, setPriceTouched] = useState(false);
  const [leadTime, setLeadTime] = useState("3");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [deliveryFee, setDeliveryFee] = useState(String(pricing?.deliveryFee ?? 15));
  const [deliveryAddress, setDeliveryAddress] = useState(audit.siteAddress || "");
  const [calloutFee, setCalloutFee] = useState(String(pricing?.calloutFee ?? 65));
  const [travel, setTravel] = useState(String(pricing?.travelBase ?? 45));
  const [hours, setHours] = useState("1");
  const [rate, setRate] = useState(String(pricing?.labourHourlyRate ?? 85));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Re-estimate when the ticked hoses change, until the supplier types a price.
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    if (!priceTouched) {
      const e = estimateHoses(items.filter((i) => next.includes(i.id)), pricing);
      setHosesPrice(e.price != null ? String(e.price) : "");
    }
  };

  const labour = Math.round((num(hours) || 0) * (num(rate) || 0));
  const onSiteTotal = (num(calloutFee) || 0) + (num(travel) || 0) + labour;
  const delivery = !onSite && fulfillment === "delivery" ? num(deliveryFee) || 0 : 0;
  const total = (num(hosesPrice) || 0) + delivery + (onSite ? onSiteTotal : 0);

  const validate = () => {
    const e: Record<string, string> = {};
    if (picked.length === 0) e.items = "Tick at least one hose to quote.";
    if (!(num(hosesPrice) >= 0)) e.hosesPrice = "Enter the price for the hose assemblies.";
    if (!(num(leadTime) >= 0 && num(leadTime) <= 365)) e.leadTime = "0–365 days.";
    if (onSite) {
      if (!(num(calloutFee) >= 0)) e.calloutFee = "Enter a callout fee (0 for none).";
      if (!(num(travel) >= 0)) e.travel = "Enter a travel charge (0 for none).";
      if (!(num(hours) >= 0)) e.hours = "Enter the labour hours.";
      if (!(num(rate) >= 0)) e.rate = "Enter the hourly rate.";
    } else if (fulfillment === "delivery") {
      if (!(num(deliveryFee) >= 0)) e.deliveryFee = "Enter a delivery fee (0 for free).";
      if (!deliveryAddress.trim()) e.deliveryAddress = "Enter the delivery address.";
    }
    if (total <= 0) e.hosesPrice = e.hosesPrice || "The quote total must be more than $0.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const clear = (k: string) => setErrors((e) => { const { [k]: _, ...rest } = e; return rest; });

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError("");
    try {
      const { requestId } = await createQuoteFromAudit(audit.id, {
        itemIds: picked, onSite, hosesPrice: num(hosesPrice), leadTimeDays: Math.round(num(leadTime)),
        calloutFee: onSite ? num(calloutFee) : 0, travelCharge: onSite ? num(travel) : 0,
        labourHours: onSite ? num(hours) : 0, hourlyRate: onSite ? num(rate) : 0,
        fulfillment: onSite ? "pickup" : fulfillment, deliveryFee: delivery,
        deliveryAddress: !onSite && fulfillment === "delivery" ? deliveryAddress.trim() : "", notes: notes.trim(),
      });
      onCreated(requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the quote — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const labels: string[] = [...new Set<string>(items.map((i) => i.machineLabel))];
  const choice = (active: boolean) =>
    `flex-1 text-left rounded-lg border px-3 py-2.5 ${active ? "border-orange-500 bg-orange-500/10 text-white" : "border-neutral-700 text-neutral-400 hover:border-neutral-500"}`;

  return (
    <div className="bg-neutral-900 border border-orange-500/40 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="text-white font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-orange-500" /> Create quote from this audit</div>
        <button onClick={onCancel} aria-label="Close" className="p-1 text-neutral-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-neutral-400 mb-4">
        {audit.customerEmail ? `${audit.customerName} is emailed the quote to accept.` : "There's no customer email on this audit — you'll get a link to send them."}
      </p>

      <div className="text-neutral-400 text-xs font-bold uppercase tracking-wide mb-2">Hoses to replace</div>
      {errors.items && <p className="text-sm text-red-400 mb-2">{errors.items}</p>}
      <div className="space-y-3 mb-5">
        {labels.map((label) => (
          <div key={label}>
            <div className="text-neutral-500 text-xs font-semibold mb-1">{label}</div>
            <div className="space-y-1.5">
              {items.filter((i) => i.machineLabel === label).map((i) => (
                <label key={i.id} className="flex items-start gap-3 bg-black/30 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-orange-500" checked={picked.includes(i.id)} onChange={() => { toggle(i.id); clear("items"); }} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-white font-semibold">{i.position}</span>
                      <Badge tone={conditionInfo(i.condition).tone}>{conditionInfo(i.condition).label}</Badge>
                    </span>
                    <span className="block text-xs text-orange-300">{auditActionLabel(i.action)}</span>
                    <span className="block text-xs text-neutral-500">{describeHoseSpec(i.spec)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-neutral-400 text-xs font-bold uppercase tracking-wide mb-2">Job</div>
      <div className="flex gap-2 mb-4">
        <button type="button" className={choice(!onSite)} onClick={() => setOnSite(false)}>
          <div className="font-semibold text-sm">Hose assemblies only</div>
          <div className="text-xs opacity-80">Made up for pickup or delivery</div>
        </button>
        <button type="button" className={choice(onSite)} onClick={() => setOnSite(true)}>
          <div className="font-semibold text-sm">On-site installation</div>
          <div className="text-xs opacity-80">You fit them at {audit.siteAddress || audit.location || "the site"}</div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4">
        <Field
          label={`Hose assemblies (${picked.length}) $`} error={errors.hosesPrice}
          hint={estimate.priced > 0
            ? `Estimated from your rates for ${estimate.priced} of ${picked.length} hose${picked.length === 1 ? "" : "s"}.`
            : "Add bore & length to the audited hoses to estimate it from your rates."}
        >
          <input type="number" min="0" inputMode="decimal" className={inputClass(errors.hosesPrice)} value={hosesPrice}
            onChange={(e) => { setHosesPrice(e.target.value); setPriceTouched(true); clear("hosesPrice"); }} />
        </Field>
        <Field label="Lead time (days)" error={errors.leadTime}>
          <input type="number" min="0" className={inputClass(errors.leadTime)} value={leadTime} onChange={(e) => { setLeadTime(e.target.value); clear("leadTime"); }} />
        </Field>
      </div>

      {onSite ? (
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Callout fee $" error={errors.calloutFee}>
            <input type="number" min="0" className={inputClass(errors.calloutFee)} value={calloutFee} onChange={(e) => { setCalloutFee(e.target.value); clear("calloutFee"); }} />
          </Field>
          <Field label="Travel $" error={errors.travel}>
            <input type="number" min="0" className={inputClass(errors.travel)} value={travel} onChange={(e) => { setTravel(e.target.value); clear("travel"); }} />
          </Field>
          <Field label="Labour hours" error={errors.hours}>
            <input type="number" min="0" step="0.5" className={inputClass(errors.hours)} value={hours} onChange={(e) => { setHours(e.target.value); clear("hours"); }} />
          </Field>
          <Field label="Hourly rate $" error={errors.rate}>
            <input type="number" min="0" className={inputClass(errors.rate)} value={rate} onChange={(e) => { setRate(e.target.value); clear("rate"); }} />
          </Field>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <button type="button" className={choice(fulfillment === "pickup")} onClick={() => setFulfillment("pickup")}>
              <div className="font-semibold text-sm">Customer picks up</div>
            </button>
            <button type="button" className={choice(fulfillment === "delivery")} onClick={() => setFulfillment("delivery")}>
              <div className="font-semibold text-sm">Deliver</div>
            </button>
          </div>
          {fulfillment === "delivery" && (
            <div className="grid grid-cols-3 gap-x-4">
              <Field label="Delivery $" error={errors.deliveryFee}>
                <input type="number" min="0" className={inputClass(errors.deliveryFee)} value={deliveryFee} onChange={(e) => { setDeliveryFee(e.target.value); clear("deliveryFee"); }} />
              </Field>
              <div className="col-span-2">
                <Field label="Deliver to" error={errors.deliveryAddress}>
                  <input className={inputClass(errors.deliveryAddress)} value={deliveryAddress} onChange={(e) => { setDeliveryAddress(e.target.value); clear("deliveryAddress"); }} />
                </Field>
              </div>
            </div>
          )}
        </>
      )}

      <Field label="Note to the customer (optional)">
        <textarea rows={2} className={inputClass()} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Can fit these Tuesday morning before the machine goes out." />
      </Field>

      <div className="bg-black/30 rounded-lg p-3 text-sm text-neutral-300 mb-4 space-y-1">
        <div className="flex justify-between"><span>Hose assemblies</span><span>{money(num(hosesPrice) || 0)}</span></div>
        {onSite && <div className="flex justify-between"><span>Callout + travel</span><span>{money((num(calloutFee) || 0) + (num(travel) || 0))}</span></div>}
        {onSite && <div className="flex justify-between"><span>Labour ({num(hours) || 0} h × {money(num(rate) || 0)})</span><span>{money(labour)}</span></div>}
        {delivery > 0 && <div className="flex justify-between"><span>Delivery</span><span>{money(delivery)}</span></div>}
        <div className="flex justify-between pt-1 border-t border-neutral-800 font-bold text-orange-400"><span>Quote total</span><span>{money(total)}</span></div>
        <div className="text-xs text-neutral-500">Separate from the audit fee.</div>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button onClick={submit} disabled={saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-4 py-2.5 rounded-lg">
          {saving ? "Sending…" : audit.customerEmail ? "Send quote to customer" : "Create quote"}
        </button>
        <button onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold px-3">Cancel</button>
      </div>
    </div>
  );
}
