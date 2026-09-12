// Supplier/admin portal cards, extracted verbatim from App.tsx:
// - JobQuoteCard: one active/accepted quote in the supplier's jobs list
// - RequestCard: one open request the supplier can quote on

import { useState } from "react";
import { Unlock, Lock, CheckCircle2, Settings } from "lucide-react";
import { combinedTotal } from "../lib/pricing";
import { URGENCY } from "../lib/catalog";
import { Badge, inputClass } from "./ui";
import { BookingSpec, ManufacturingSpec, AssemblyPriceBreakdown } from "./specs";
import { ActiveQuoteEditor, SupplierFieldServiceReview, AutoQuoteReview } from "./quoteEditors";

export function JobQuoteCard({ q, req, unlocked, pricing, onUpdateFieldService, onUnlock, onMarkComplete, onEditQuote }: any) {
  const [editing, setEditing] = useState(false);
  const isCompleted = q.status === "completed";
  const isAccepted = q.status === "accepted" || isCompleted;
  // A job can be marked complete once it's confirmed, even if the customer never
  // explicitly clicked "Accept" — don't make completion depend on that extra step.
  const canComplete = (q.status === "confirmed" || q.status === "accepted") && !isCompleted;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-orange-500 font-mono text-sm">{q.requestId}</span>
        <div className="flex items-center gap-2">
          {!q.isBooking && q.fieldService?.requested && <Badge tone="orange">On-site</Badge>}
          <Badge tone={q.quoteType === "auto" ? "neutral" : "amber"}>{q.quoteType}</Badge>
          <Badge tone={isCompleted ? "green" : isAccepted ? "orange" : "neutral"}>{q.status}</Badge>
        </div>
      </div>

      {q.isBooking ? (
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
          <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
            <span className="text-sm font-bold text-orange-500">Total</span>
            <span className="text-lg font-extrabold text-orange-500">${q.priceLow} – ${q.priceHigh}</span>
          </div>
        </div>
      ) : (() => {
        const ct = combinedTotal(q);
        const showBreakdown = ct.hasOnSite && q.fieldService?.status !== "pending";
        if (!showBreakdown) {
          return <div className="text-white font-bold text-lg mb-1">${ct.low} – ${ct.high}</div>;
        }
        return (
          <div className="bg-black/30 rounded-lg p-3 space-y-2 mb-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-300">Hose assembly</span>
              <span className="text-white font-semibold">${q.priceLow} – ${q.priceHigh}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-300">On-site callout &amp; travel</span>
              <span className="text-white font-semibold">${q.fieldService.calloutFee + q.fieldService.travelCharge}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
              <span className="text-sm font-bold text-orange-500">Total</span>
              <span className="text-lg font-extrabold text-orange-500">${ct.low} – ${ct.high}</span>
            </div>
          </div>
        );
      })()}

      {req && (q.isBooking ? <BookingSpec r={req} /> : <ManufacturingSpec r={req} compact />)}

      {q.status === "confirmed" && !q.isBooking && q.fieldService?.requested && (
        <SupplierFieldServiceReview quote={q} pricing={pricing} onUpdate={onUpdateFieldService} />
      )}

      {isAccepted && !isCompleted && (
        unlocked ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm mt-3">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1"><Unlock className="w-3.5 h-3.5" /> Contact unlocked</div>
            <div className="text-white">{req?.name}</div>
            <div className="text-neutral-400">{req?.phone} {req?.phone && req?.email && "·"} {req?.email}</div>
          </div>
        ) : (
          <button onClick={() => onUnlock(q.id)} className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors mt-3">
            <Lock className="w-4 h-4" /> Unlock Contact Details
          </button>
        )
      )}

      {canComplete && (
        <button onClick={() => onMarkComplete(q.id)} className="w-full flex items-center justify-center gap-2 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400 font-bold py-2.5 rounded-lg transition-colors mt-2">
          <CheckCircle2 className="w-4 h-4" /> Mark as complete
        </button>
      )}

      {onEditQuote && !isCompleted && (
        <div className="mt-2">
          <button onClick={() => setEditing((e) => !e)} className="w-full flex items-center justify-center gap-2 border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 font-semibold py-2.5 rounded-lg text-sm transition-colors">
            <Settings className="w-3.5 h-3.5" /> {editing ? "Hide pricing editor" : "Edit pricing (Admin)"}
          </button>
          {editing && <ActiveQuoteEditor quote={q} onSave={(overrides) => { onEditQuote(q.id, overrides); setEditing(false); }} />}
        </div>
      )}

      {isCompleted && (
        <div className="mt-3 text-xs text-neutral-500 border-t border-neutral-800 pt-3">
          Completed {q.completedAt ? new Date(q.completedAt).toLocaleDateString() : ""}
        </div>
      )}
    </div>
  );
}

export function RequestCard({ r, myQuote, pricing, onSubmitManualQuote, onConfirmQuote, onRejectQuote }: any) {
  const [showForm, setShowForm] = useState(false);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [lead, setLead] = useState(3);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-orange-500 font-mono text-sm">{r.id}</span>
        <div className="flex items-center gap-2">
          {r.requestType !== "booking" && r.fieldServiceRequested && <Badge tone="orange">On-site</Badge>}
          <Badge tone={r.urgency === "emergency" ? "red" : r.urgency === "priority" ? "amber" : "neutral"}>{URGENCY.find((u) => u.key === r.urgency)?.label}</Badge>
        </div>
      </div>
      <div className="text-white font-semibold mb-2">
        {r.requestType === "booking" ? `${r.equipmentType} — ${r.issue}` : (r.assemblies?.length > 1 ? `${r.assemblies.length} hose assemblies` : r.assemblies?.[0]?.hoseType)}
      </div>
      {r.requestType === "booking" ? <BookingSpec r={r} /> : <ManufacturingSpec r={r} />}
      {r.requestType !== "booking" && <AssemblyPriceBreakdown r={r} pricing={pricing} />}

      {myQuote ? (
        myQuote.status === "pending" && myQuote.quoteType === "auto" ? (
          <AutoQuoteReview quote={myQuote} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote} />
        ) : (
          <div className="text-sm text-emerald-400 font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Quoted: ${myQuote.priceLow} – ${myQuote.priceHigh} ({myQuote.quoteType})</div>
        )
      ) : showForm ? (
        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Low $" className={inputClass()} value={low} onChange={(e) => setLow(e.target.value)} />
            <input type="number" placeholder="High $" className={inputClass()} value={high} onChange={(e) => setHigh(e.target.value)} />
          </div>
          <input type="number" placeholder="Lead time (days)" className={inputClass()} value={lead} onChange={(e) => setLead(e.target.value)} />
          <button
            onClick={() => { if (low && high) { onSubmitManualQuote(r.id, parseFloat(low), parseFloat(high), parseInt(lead) || 1); setShowForm(false); } }}
            className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors"
          >
            Submit quote
          </button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="text-sm border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 px-4 py-2 rounded-lg transition-colors">
          Submit manual quote
        </button>
      )}
    </div>
  );
}
