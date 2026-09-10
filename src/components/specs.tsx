// Read-only request / quote spec panels. No state — extracted verbatim from
// App.tsx.

import { URGENCY } from "../lib/catalog";
import { calcEstimate } from "../lib/pricing";

export function BookingSpec({ r }) {
  return (
    <div className="bg-black/30 rounded-lg p-3 text-sm space-y-2 mb-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
        <div><span className="text-neutral-500">Equipment:</span> {r.equipmentType}</div>
        <div><span className="text-neutral-500">Issue:</span> {r.issue}</div>
        <div><span className="text-neutral-500">Priority:</span> {URGENCY.find((u) => u.key === r.urgency)?.label}</div>
        <div className="col-span-2"><span className="text-neutral-500">Location:</span> {r.location}</div>
      </div>
      {r.description && <div className="text-neutral-300 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Details:</span> {r.description}</div>}
      {r.labourHoursEstimate && <div className="text-orange-400 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Customer's time estimate:</span> {r.labourHoursEstimate} hour{parseFloat(r.labourHoursEstimate) !== 1 ? "s" : ""}</div>}
      {r.notes && <div className="text-neutral-300 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Notes:</span> {r.notes}</div>}
      {r.photoUrl && <div className="text-neutral-300"><span className="text-neutral-500">Photo:</span> <span className="text-orange-500 underline break-all">{r.photoUrl}</span></div>}
    </div>
  );
}

export function AssemblyPriceBreakdown({ r, pricing }) {
  if (!pricing) return null;
  const est = calcEstimate(r, pricing);
  if (!est || !est.assemblyBreakdown.length) return null;
  return (
    <div className="bg-black/30 rounded-lg p-3 text-sm mb-3">
      <div className="text-neutral-500 text-xs font-semibold uppercase tracking-wide mb-2">Assembly Pricing (your rates)</div>
      <div className="space-y-1.5">
        {est.assemblyBreakdown.map((ab) => (
          <div key={ab.index} className="flex items-center justify-between">
            <span className="text-neutral-300">Assembly {ab.index + 1} — {ab.hoseType} · {ab.bore?.replace(/_/g, "/")}" · {ab.length}m × {ab.quantity}</span>
            <span className="text-white font-semibold whitespace-nowrap ml-3">${Math.round(ab.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-700">
        <span className="text-neutral-400 text-xs">+ Labour ${Math.round(est.labour)}, Crimp ${Math.round(est.crimp)}, Travel ${Math.round(est.travel)}{est.callout ? `, Callout $${Math.round(est.callout)}` : ""}</span>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-bold text-orange-500">Total</span>
        <span className="font-extrabold text-orange-500">${est.low} – ${est.high}</span>
      </div>
    </div>
  );
}

export function ManufacturingSpec({ r, compact }: any) {
  const assemblies = r.assemblies || [];
  return (
    <div className={`bg-black/30 rounded-lg p-3 text-sm space-y-2 ${compact ? "mb-3" : "mb-3"}`}>
      {assemblies.map((a, idx) => (
        <div key={a.id || idx} className={idx > 0 ? "pt-2 border-t border-neutral-800" : ""}>
          {assemblies.length > 1 && <div className="text-orange-500 text-xs font-bold mb-1">ASSEMBLY {idx + 1}</div>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
            <div><span className="text-neutral-500">Category:</span> {a.category === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"}</div>
            <div><span className="text-neutral-500">Hose type:</span> {a.hoseType}</div>
            <div><span className="text-neutral-500">Bore:</span> {a.bore?.replace(/_/g, "/")}"</div>
            <div><span className="text-neutral-500">Length:</span> {a.length}m × {a.quantity}</div>
            <div className="col-span-2"><span className="text-neutral-500">Pressure:</span> {a.pressure} PSI</div>
          </div>
          <div className="mt-1.5 space-y-1 text-neutral-300">
            <div><span className="text-neutral-500">Fitting A:</span> {a.fittingAType} ({a.fittingAOrientation})</div>
            <div><span className="text-neutral-500">Fitting B:</span> {a.fittingBType} ({a.fittingBOrientation})</div>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300 pt-2 border-t border-neutral-800">
        <div><span className="text-neutral-500">Urgency:</span> {URGENCY.find((u) => u.key === r.urgency)?.label}</div>
        <div className="col-span-2"><span className="text-neutral-500">Location:</span> {r.location}</div>
      </div>
      {r.notes && <div className="text-neutral-300 pt-1 border-t border-neutral-800 mt-1"><span className="text-neutral-500">Notes:</span> {r.notes}</div>}
      {r.photoUrl && <div className="text-neutral-300"><span className="text-neutral-500">Photo:</span> <span className="text-orange-500 underline break-all">{r.photoUrl}</span></div>}
      {r.fieldServiceRequested && (
        <div className="text-orange-400 pt-1 border-t border-neutral-800 mt-1">
          <span className="text-neutral-500">On-site service requested:</span> {r.siteAddress}{r.accessNotes ? ` — ${r.accessNotes}` : ""}
        </div>
      )}
    </div>
  );
}
