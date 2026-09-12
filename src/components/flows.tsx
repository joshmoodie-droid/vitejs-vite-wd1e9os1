// The two customer request wizards, extracted verbatim from App.tsx:
// - CustomerFlow: multi-step hose-assembly quote wizard + post-submit quote view
// - BookingFlow: multi-step field-service booking wizard + post-submit view

import { useEffect, useRef } from "react";
import { Send, Clock, ChevronLeft, ChevronRight, MapPin, User, Wrench, Gauge, Droplet, Truck, ClipboardList, Plus, ArrowLeft } from "lucide-react";
import { areasMatch } from "../lib/util";
import { calcEstimate, combinedTotal, calcBookingEstimate } from "../lib/pricing";
import { emptyBookingForm } from "../lib/forms";
import { URGENCY, EQUIPMENT_TYPES, JOB_ISSUES } from "../lib/catalog";
import { Field, inputClass, StepDot, SectionTitle, Badge } from "./ui";
import { AssemblyCard } from "./AssemblyCard";
import { FieldServiceSection } from "./FieldServiceSection";

export function CustomerFlow({ form, update, errors, step, next, back, submit, updateAssembly, addAssembly, removeAssembly, suppliers, pricingBySupplier, submittedRequestId, resetWizard, quotes, acceptQuote, requestFieldService, confirmFieldService, onBack }: any) {
  // The on-site toggle reveals the site-address fields directly below it —
  // with no scroll or transition, that reveal is easy to miss if the toggle
  // is near the bottom of the viewport (it read as "clicking it doesn't do
  // anything" in practice). Scroll the revealed section into view so the
  // effect of the toggle is unmistakable.
  const onSiteFieldsRef = useRef(null);
  useEffect(() => {
    if (form.fieldServiceRequested) {
      onSiteFieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [form.fieldServiceRequested]);

  // Same reveal-is-easy-to-miss issue as the on-site toggle above, for the
  // delivery-address fields that appear when Delivery is picked.
  const deliveryFieldsRef = useRef(null);
  useEffect(() => {
    if (!form.fieldServiceRequested && form.fulfillment === "delivery") {
      deliveryFieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [form.fieldServiceRequested, form.fulfillment]);

  const previewQuotes = suppliers
    .filter((s) => areasMatch(form.location, s.serviceArea))
    .map((s) => ({ supplierId: s.id, est: calcEstimate(form, pricingBySupplier[s.id]) }))
    .filter((pq) => pq.est)
    .sort((a, b) => a.est.low - b.est.low);
  const selectedSupplierName = suppliers.find((s) => s.id === form.selectedSupplierId)?.companyName;
  if (submittedRequestId) {
    const myQuotes = quotes.filter((q) => q.requestId === submittedRequestId && q.status !== "declined").sort((a, b) => a.priceLow - b.priceLow);
    const accepted = myQuotes.find((q) => q.status === "accepted" || q.status === "completed");
    return (
      <div>
        <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-6 text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-1">Request sent</h2>
          <p className="text-neutral-400">Reference <span className="text-orange-500 font-mono">{submittedRequestId}</span></p>
          {selectedSupplierName && (
            <p className="text-xs text-amber-500/80 mt-3 border-t border-neutral-800 pt-3">
              🛠 Testing note (not shown to real customers): this went to <strong>{selectedSupplierName}</strong> — log into the Supplier Portal as this company to confirm it.
            </p>
          )}
        </div>

        <div className="text-white font-bold mb-3">
          {myQuotes.some((q) => q.status !== "rejected") ? "Your quote" : "Update from supplier"}
        </div>
        {myQuotes.length === 0 && (
          <div className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800 rounded-xl mb-6">
            This supplier is no longer available for this request. Try submitting again.
          </div>
        )}
        <div className="space-y-3 mb-6">
          {myQuotes.map((q, idx) => {
            const s = suppliers.find((sp) => sp.id === q.supplierId);
            const isAccepted = q.status === "accepted" || q.status === "completed";
            const isConfirmed = q.status === "confirmed" || isAccepted;
            const isRejected = q.status === "rejected";
            const isCompleted = q.status === "completed";
            const displayName = isConfirmed ? (s?.companyName || "Supplier") : `Supplier ${idx + 1}`;

            if (isRejected) {
              return (
                <div key={q.id} className="rounded-xl p-5 border border-red-500/30 bg-red-500/5">
                  <div className="text-white font-bold mb-1">This supplier can't take this job</div>
                  <p className="text-sm text-neutral-400">Try submitting a new request and choosing a different supplier.</p>
                </div>
              );
            }

            return (
              <div key={q.id} className={`rounded-xl p-5 border ${isAccepted ? "border-orange-500 bg-orange-500/5" : "border-neutral-800 bg-neutral-900"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={isConfirmed ? "text-white font-bold" : "text-neutral-400 font-bold italic"}>{displayName}</div>
                    {!isConfirmed && <span title="Name revealed once the supplier confirms this quote"><Clock className="w-3.5 h-3.5 text-neutral-600" /></span>}
                  </div>
                  {isCompleted && <Badge tone="green">Job completed</Badge>}
                  {isAccepted && !isCompleted && <Badge tone="orange">Accepted</Badge>}
                  {!isConfirmed && <Badge tone="neutral">Awaiting confirmation</Badge>}
                </div>

                {(() => {
                  const ct = combinedTotal(q);
                  const fs = q.fieldService;
                  const showBreakdown = ct.hasOnSite && (fs?.status === "quoted" || fs?.status === "confirmed");
                  if (!showBreakdown) {
                    return (
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-extrabold text-orange-500">${ct.low} – ${ct.high}</div>
                        <div className="text-sm text-neutral-500">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} lead time</div>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-black/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">Hose assembly</span>
                        <span className="text-white font-semibold">${q.priceLow} – ${q.priceHigh}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">On-site callout &amp; travel</span>
                        <span className="text-white font-semibold">${fs.calloutFee + fs.travelCharge}</span>
                      </div>
                      {fs.labour > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-300">On-site labour{fs.labourHours ? ` (${fs.labourHours}h @ $${fs.hourlyRate}/hr)` : ""}</span>
                          <span className="text-white font-semibold">${fs.labour}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
                        <span className="text-sm font-bold text-orange-500">Total</span>
                        <span className="text-2xl font-extrabold text-orange-500">${ct.low} – ${ct.high}</span>
                      </div>
                      <div className="text-xs text-neutral-500 text-right">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} lead time</div>
                    </div>
                  );
                })()}

                {!accepted && isConfirmed && !isAccepted && (
                  <button onClick={() => acceptQuote(q.id, submittedRequestId)} className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">
                    Accept this quote
                  </button>
                )}
                {!isConfirmed && (
                  <p className="text-xs text-neutral-600 mt-3">This supplier hasn't confirmed their quote yet — their name and an accept option will appear once they do.</p>
                )}
                {isConfirmed && (
                  <FieldServiceSection quote={q} requestFieldService={requestFieldService} confirmFieldService={confirmFieldService} />
                )}
              </div>
            );
          })}
        </div>

        <button onClick={resetWizard} className="w-full border border-neutral-700 text-neutral-300 font-semibold px-6 py-3 rounded-lg transition-colors hover:border-orange-500 hover:text-white">
          Request another quote
        </button>
      </div>
    );
  }

  return (
    <div>
      {onBack && step === 1 && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Droplet className="w-3.5 h-3.5" /> Hydraulic Hose Quote Service
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Get Competing Hose Quotes</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Submit your requirements once and hear back from multiple suppliers.</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center justify-between">
        <span className="text-white font-semibold">Step {step} of 3 — {["Hose details", "Fittings & urgency", "Contact details"][step - 1]}</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => <StepDot key={n} n={n} active={n === step} done={n < step} />)}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        {step === 1 && (
          <>
            <SectionTitle icon={Wrench} title="Hose Assemblies" subtitle="Add each hose you need — you can request several in one quote." />
            <div className="space-y-4 mb-4">
              {form.assemblies.map((a, idx) => (
                <AssemblyCard
                  key={a.id} assembly={a} index={idx} errors={errors}
                  onChange={(key, value) => updateAssembly(idx, key, value)}
                  onRemove={form.assemblies.length > 1 ? () => removeAssembly(idx) : null}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addAssembly}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-400 font-semibold py-3 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add another hose assembly
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <SectionTitle icon={Gauge} title="Urgency & Location" />
            <Field label="Urgency" required>
              <div className="grid grid-cols-3 gap-3">
                {URGENCY.map((u) => (
                  <button key={u.key} onClick={() => update("urgency", u.key)}
                    className={`py-3 px-2 rounded-lg border text-center transition-colors ${form.urgency === u.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"}`}>
                    <div className={form.urgency === u.key ? "text-orange-500 font-bold" : "text-neutral-300 font-bold"}>{u.label}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{u.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Suburb or Postcode" required error={errors.location}>
              <div className="relative">
                <MapPin className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input placeholder="e.g. Maroochydore or 4558" className={inputClass(errors.location) + " pl-10"} value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
            </Field>

            <button
              type="button"
              onClick={() => update("fieldServiceRequested", !form.fieldServiceRequested)}
              className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 mb-5 transition-colors ${
                form.fieldServiceRequested ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"
              }`}
            >
              <span className="text-left">
                <span className={`block font-semibold ${form.fieldServiceRequested ? "text-orange-500" : "text-white"}`}>On-site installation / service</span>
                <span className="block text-xs text-neutral-500 mt-0.5">Have a supplier come to you, instead of collecting the hose yourself</span>
              </span>
              <span className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${form.fieldServiceRequested ? "bg-orange-500 justify-end" : "bg-neutral-700 justify-start"}`}>
                <span className="w-5 h-5 rounded-full bg-white" />
              </span>
            </button>

            {form.fieldServiceRequested && (
              <div ref={onSiteFieldsRef}>
                <Field label="Site Address" required error={errors.siteAddress}>
                  <input placeholder="Full address for the callout" className={inputClass(errors.siteAddress)} value={form.siteAddress} onChange={(e) => update("siteAddress", e.target.value)} />
                </Field>
                <Field label="Site Access Notes (optional)" hint="Gate codes, parking, machine location, etc.">
                  <textarea rows={2} className={inputClass()} value={form.accessNotes} onChange={(e) => update("accessNotes", e.target.value)} />
                </Field>
                <Field label="Estimated Installation Time (optional)" hint="How long do you think the on-site work will take? The supplier will confirm the actual labour cost.">
                  <div className="flex gap-3">
                    <input type="number" step="0.5" placeholder="e.g. 1" className={inputClass()} value={form.fsLabourHoursEstimate} onChange={(e) => update("fsLabourHoursEstimate", e.target.value)} />
                    <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
                  </div>
                </Field>
              </div>
            )}

            {!form.fieldServiceRequested && (
              <>
                <Field label="Getting your hose assembly" required>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "pickup", label: "Pickup", desc: "Collect it from the supplier once it's ready" },
                      { key: "delivery", label: "Delivery", desc: "Have it posted or couriered to you" },
                    ].map((o) => (
                      <button key={o.key} type="button" onClick={() => update("fulfillment", o.key)}
                        className={`text-left py-2.5 px-3 rounded-lg border transition-colors ${form.fulfillment === o.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"}`}>
                        <div className={`font-semibold text-sm ${form.fulfillment === o.key ? "text-orange-500" : "text-white"}`}>{o.label}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{o.desc}</div>
                      </button>
                    ))}
                  </div>
                </Field>

                {form.fulfillment === "delivery" && (
                  <div ref={deliveryFieldsRef}>
                    <Field label="Delivery Address" required error={errors.deliveryAddress}>
                      <input placeholder="Full delivery address" className={inputClass(errors.deliveryAddress)} value={form.deliveryAddress} onChange={(e) => update("deliveryAddress", e.target.value)} />
                    </Field>
                    <Field label="Delivery Notes (optional)" hint="Anything the courier should know — access, preferred time, etc.">
                      <textarea rows={2} className={inputClass()} value={form.deliveryNotes} onChange={(e) => update("deliveryNotes", e.target.value)} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <SectionTitle icon={User} title="Your Contact Details" />
            <Field label="Full Name" required error={errors.name}>
              <input placeholder="e.g. John Smith" className={inputClass(errors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={errors.phone}>
                <input placeholder="e.g. 0412 345 678" className={inputClass(errors.phone)} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input placeholder="e.g. john@example.com" className={inputClass(errors.email)} value={form.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Preferred Date / Time" hint="When would you like the service?">
              <input placeholder="e.g. Tomorrow morning" className={inputClass()} value={form.preferredTime} onChange={(e) => update("preferredTime", e.target.value)} />
            </Field>
            <Field label="Notes (optional)" hint="Any extra details about the job, access, timing, etc.">
              <textarea rows={3} placeholder="e.g. Hose is on an excavator, need mobile service on site." className={inputClass()} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </Field>
            <Field label="Photo URL (optional)" hint="Link to a photo of the hose or fitting if available">
              <input placeholder="https://..." className={inputClass()} value={form.photoUrl} onChange={(e) => update("photoUrl", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {previewQuotes.length > 0 && step < 3 && (
        <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-white font-bold flex items-center gap-2"><Gauge className="w-4 h-4 text-orange-500" /> Indicative Price</div>
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full font-semibold">Indicative</span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Select a supplier to proceed with. Names appear once they confirm your request.</p>
          <div className="space-y-2 mb-1">
            {previewQuotes.map((pq, idx) => {
              const selected = form.selectedSupplierId === pq.supplierId;
              const displayLow = pq.est.low + pq.est.callout;
              const displayHigh = pq.est.high + pq.est.callout;
              return (
                <button
                  type="button"
                  key={pq.supplierId}
                  onClick={() => update("selectedSupplierId", pq.supplierId)}
                  className={`w-full rounded-lg px-4 py-3 border transition-colors ${
                    selected ? "border-orange-500 bg-orange-500/10" : "border-transparent bg-black/30 hover:border-neutral-700"
                  }`}
                >
                  <div className={`text-sm font-medium mb-2 text-left ${selected ? "text-orange-500" : "text-neutral-400"}`}>
                    {selected && "✓ "}Supplier {idx + 1}
                  </div>

                  {form.fieldServiceRequested ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">Hose assembly</span>
                        <span className="text-white font-semibold">${pq.est.low} – ${pq.est.high}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">On-site callout</span>
                        <span className="text-white font-semibold">${pq.est.callout}</span>
                      </div>
                      <div className={`flex items-center justify-between pt-1.5 border-t ${selected ? "border-orange-500/30" : "border-neutral-700"}`}>
                        <span className={`text-sm font-bold ${selected ? "text-orange-500" : "text-white"}`}>Total</span>
                        <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${displayLow} – ${displayHigh}</span>
                      </div>
                    </div>
                  ) : pq.est.delivery ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">Includes delivery</span>
                        <span className="text-white font-semibold">${pq.est.delivery}</span>
                      </div>
                      <div className={`flex items-center justify-between pt-1.5 border-t ${selected ? "border-orange-500/30" : "border-neutral-700"}`}>
                        <span className={`text-sm font-bold ${selected ? "text-orange-500" : "text-white"}`}>Total</span>
                        <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${displayLow} – ${displayHigh}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-400">Total</span>
                      <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${displayLow} – ${displayHigh}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {errors.selectedSupplierId && <p className="text-xs text-red-400 mt-2">{errors.selectedSupplierId}</p>}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={back} disabled={step === 1} className="flex items-center gap-2 px-5 py-3 rounded-lg border border-neutral-700 text-neutral-300 disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < 3 ? (
          <button onClick={next} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={submit} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Get Quotes <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function BookingFlow({ suppliers, pricingBySupplier, quotes, onSubmitBooking, acceptQuote, onBack, step, setStep, form, setForm, errors, setErrors, submittedRequestId, setSubmittedRequestId }: any) {
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const previewQuotes = suppliers
    .filter((s) => areasMatch(form.location, s.serviceArea))
    .map((s) => ({ supplierId: s.id, est: calcBookingEstimate(form, pricingBySupplier[s.id]) }))
    .filter((pq) => pq.est)
    .sort((a, b) => a.est.low - b.est.low);

  const validateStep = (s) => {
    const e: any = {};
    if (s === 1) {
      if (!form.equipmentType) e.equipmentType = "Select the equipment type.";
      if (!form.issue) e.issue = "Select what's wrong / what's needed.";
    }
    if (s === 2) {
      if (!form.location) e.location = "Enter the job location.";
      if (!form.selectedSupplierId) e.selectedSupplierId = "Select a supplier to continue.";
    }
    if (s === 3) {
      if (!form.name) e.name = "Enter your full name.";
      if (!form.phone && !form.email) {
        e.phone = "Enter at least a phone number or email.";
        e.email = "Enter at least a phone number or email.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((s) => Math.min(3, s + 1)); };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!validateStep(3)) return;
    const id = `HQ-B-${Date.now()}`;
    const record = { id, ...form };
    const pricing = pricingBySupplier[form.selectedSupplierId];
    const est = calcBookingEstimate(form, pricing);
    const newQuote = est ? {
      id: `Q-${Date.now()}-${form.selectedSupplierId}`, supplierId: form.selectedSupplierId,
      priceLow: est.low, priceHigh: est.high,
      calloutFee: est.calloutFee, travelCharge: est.travelCharge, labour: est.labour, customerLabourHours: form.labourHoursEstimate || null,
      leadTimeDays: form.urgency === "emergency" ? 1 : form.urgency === "priority" ? 2 : 4,
    } : null;

    await onSubmitBooking(record, newQuote);
    setSubmittedRequestId(id);
  };

  const resetBooking = () => { setForm(emptyBookingForm()); setStep(1); setSubmittedRequestId(null); setErrors({}); onBack(); };

  if (submittedRequestId) {
    const myQuotes = quotes.filter((q) => q.requestId === submittedRequestId && q.status !== "declined").sort((a, b) => a.priceLow - b.priceLow);
    const accepted = myQuotes.find((q) => q.status === "accepted" || q.status === "completed");
    return (
      <div>
        <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-6 text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-1">Booking request sent</h2>
          <p className="text-neutral-400">Reference <span className="text-orange-500 font-mono">{submittedRequestId}</span></p>
        </div>

        <div className="text-white font-bold mb-3">Booking status</div>
        {myQuotes.length === 0 && (
          <div className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800 rounded-xl mb-6">
            This supplier is no longer available for this booking. Try submitting again.
          </div>
        )}
        <div className="space-y-3 mb-6">
          {myQuotes.map((q, idx) => {
            const s = suppliers.find((sp) => sp.id === q.supplierId);
            const isAccepted = q.status === "accepted" || q.status === "completed";
            const isConfirmed = q.status === "confirmed" || isAccepted;
            const isRejected = q.status === "rejected";
            const isCompleted = q.status === "completed";
            const displayName = isConfirmed ? (s?.companyName || "Supplier") : `Supplier ${idx + 1}`;

            if (isRejected) {
              return (
                <div key={q.id} className="rounded-xl p-5 border border-red-500/30 bg-red-500/5">
                  <div className="text-white font-bold mb-1">This supplier can't take this job</div>
                  <p className="text-sm text-neutral-400">Try submitting a new booking and choosing a different supplier.</p>
                </div>
              );
            }

            return (
              <div key={q.id} className={`rounded-xl p-5 border ${isAccepted ? "border-orange-500 bg-orange-500/5" : "border-neutral-800 bg-neutral-900"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={isConfirmed ? "text-white font-bold" : "text-neutral-400 font-bold italic"}>{displayName}</div>
                    {!isConfirmed && <span title="Name revealed once the supplier confirms this booking"><Clock className="w-3.5 h-3.5 text-neutral-600" /></span>}
                  </div>
                  {isCompleted && <Badge tone="green">Job completed</Badge>}
                  {isAccepted && !isCompleted && <Badge tone="orange">Accepted</Badge>}
                  {!isConfirmed && <Badge tone="neutral">Awaiting confirmation</Badge>}
                </div>

                {isConfirmed ? (
                  <div className="bg-black/30 rounded-lg p-3 space-y-2 mb-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Callout fee</span>
                      <span className="text-white font-semibold">${q.calloutFee}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Travel charge</span>
                      <span className="text-white font-semibold">${q.travelCharge}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Labour{q.labourHours ? ` (${q.labourHours}h @ $${q.hourlyRate}/hr)` : ""}</span>
                      <span className="text-white font-semibold">${q.labour}</span>
                    </div>
                    {q.hoseAssemblyCost > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">Hose assembly / materials</span>
                        <span className="text-white font-semibold">${q.hoseAssemblyCost}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
                      <span className="text-sm font-bold text-orange-500">Total</span>
                      <span className="text-2xl font-extrabold text-orange-500">${q.priceLow} – ${q.priceHigh}</span>
                    </div>
                    <div className="text-xs text-neutral-500 text-right">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} until technician arrives</div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">This supplier hasn't confirmed callout pricing and timeframe yet.</p>
                )}

                {!accepted && isConfirmed && !isAccepted && (
                  <button onClick={() => acceptQuote(q.id, submittedRequestId)} className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">
                    Accept &amp; Confirm Booking
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={resetBooking} className="w-full border border-neutral-700 text-neutral-300 font-semibold px-6 py-3 rounded-lg transition-colors hover:border-orange-500 hover:text-white">
          Back to start
        </button>
      </div>
    );
  }

  return (
    <div>
      {step === 1 && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Truck className="w-3.5 h-3.5" /> Field Service Booking
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Book a Technician</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Tell us about the job and we'll get you indicative pricing and a timeframe.</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center justify-between">
        <span className="text-white font-semibold">Step {step} of 3 — {["Job details", "Location & supplier", "Contact details"][step - 1]}</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => <StepDot key={n} n={n} active={n === step} done={n < step} />)}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        {step === 1 && (
          <>
            <SectionTitle icon={ClipboardList} title="Job Details" />
            <Field label="Equipment Type" required error={errors.equipmentType}>
              <select className={inputClass(errors.equipmentType)} value={form.equipmentType} onChange={(e) => update("equipmentType", e.target.value)}>
                <option className="bg-neutral-900 text-white" value="">Select equipment...</option>
                {EQUIPMENT_TYPES.map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="What's wrong / what's needed" required error={errors.issue}>
              <select className={inputClass(errors.issue)} value={form.issue} onChange={(e) => update("issue", e.target.value)}>
                <option className="bg-neutral-900 text-white" value="">Select an issue...</option>
                {JOB_ISSUES.map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Additional details (optional)" hint="Anything that helps the technician prepare — hose size if known, machine make/model, access, etc.">
              <textarea rows={4} placeholder="e.g. 3/8 hose burst on the boom ram of a 5-tonne excavator, on-site in a paddock." className={inputClass()} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </Field>
            <Field label="Estimated Labour Time (optional)" hint="How long do you think the job will take? The supplier will confirm the actual labour cost.">
              <div className="flex gap-3">
                <input type="number" step="0.5" placeholder="e.g. 1" className={inputClass()} value={form.labourHoursEstimate} onChange={(e) => update("labourHoursEstimate", e.target.value)} />
                <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <SectionTitle icon={Gauge} title="Location &amp; Priority" />
            <Field label="Job Location" required error={errors.location}>
              <div className="relative">
                <MapPin className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input placeholder="Full address or suburb where the job is" className={inputClass(errors.location) + " pl-10"} value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
            </Field>
            <Field label="Priority" required>
              <div className="grid grid-cols-3 gap-3">
                {URGENCY.map((u) => (
                  <button key={u.key} type="button" onClick={() => update("urgency", u.key)}
                    className={`py-3 px-2 rounded-lg border text-center transition-colors ${form.urgency === u.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"}`}>
                    <div className={form.urgency === u.key ? "text-orange-500 font-bold" : "text-neutral-300 font-bold"}>{u.label}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{u.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <SectionTitle icon={User} title="Your Contact Details" />
            <Field label="Full Name" required error={errors.name}>
              <input placeholder="e.g. John Smith" className={inputClass(errors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={errors.phone}>
                <input placeholder="e.g. 0412 345 678" className={inputClass(errors.phone)} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input placeholder="e.g. john@example.com" className={inputClass(errors.email)} value={form.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Preferred Date / Time" hint="When would you like the technician to come?">
              <input placeholder="e.g. Tomorrow morning" className={inputClass()} value={form.preferredTime} onChange={(e) => update("preferredTime", e.target.value)} />
            </Field>
            <Field label="Notes (optional)" hint="Site access, gate codes, parking, etc.">
              <textarea rows={3} className={inputClass()} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </Field>
            <Field label="Photo URL (optional)" hint="Link to a photo of the issue if available">
              <input placeholder="https://..." className={inputClass()} value={form.photoUrl} onChange={(e) => update("photoUrl", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {previewQuotes.length > 0 && step === 2 && (
        <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-white font-bold flex items-center gap-2"><Gauge className="w-4 h-4 text-orange-500" /> Indicative Callout Price</div>
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full font-semibold">Indicative</span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Select a supplier to proceed with. Names appear once they confirm your booking.</p>
          <div className="space-y-2 mb-1">
            {previewQuotes.map((pq, idx) => {
              const selected = form.selectedSupplierId === pq.supplierId;
              return (
                <button
                  type="button"
                  key={pq.supplierId}
                  onClick={() => update("selectedSupplierId", pq.supplierId)}
                  className={`w-full rounded-lg px-4 py-3 border transition-colors ${
                    selected ? "border-orange-500 bg-orange-500/10" : "border-transparent bg-black/30 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${selected ? "text-orange-500" : "text-neutral-400"}`}>
                      {selected && "✓ "}Supplier {idx + 1}
                    </span>
                    <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${pq.est.low} – ${pq.est.high}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
                    <span>Callout ${pq.est.calloutFee} + Travel ${pq.est.travelCharge} + Labour ${pq.est.labour} ({pq.est.labourHours}h @ ${pq.est.hourlyRate}/hr)</span>
                  </div>
                </button>
              );
            })}
          </div>
          {errors.selectedSupplierId && <p className="text-xs text-red-400 mt-2">{errors.selectedSupplierId}</p>}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={back} disabled={step === 1} className="flex items-center gap-2 px-5 py-3 rounded-lg border border-neutral-700 text-neutral-300 disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < 3 ? (
          <button onClick={next} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={submit} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Send Booking Request <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
