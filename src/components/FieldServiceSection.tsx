// Customer-side on-site service block shown under a quote in CustomerFlow.
// Extracted verbatim from App.tsx. Lets the customer request on-site
// installation/service and then confirm the supplier's on-site pricing.

import { useState } from "react";
import { Badge, inputClass } from "./ui";

export function FieldServiceSection({ quote, requestFieldService, confirmFieldService }: any) {
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [hours, setHours] = useState("");
  const fs = quote.fieldService;

  if (!fs || !fs.requested) {
    return showForm ? (
      <div className="mt-4 border-t border-neutral-800 pt-4 space-y-3">
        <div className="text-white font-semibold text-sm">Request on-site installation / service</div>
        <input placeholder="Site address" className={inputClass()} value={address} onChange={(e) => setAddress(e.target.value)} />
        <textarea rows={2} placeholder="Site access notes (optional)" className={inputClass()} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex gap-3">
          <input type="number" step="0.5" placeholder="Estimated hours (optional)" className={inputClass()} value={hours} onChange={(e) => setHours(e.target.value)} />
          <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (address) { requestFieldService(quote.id, address, notes, hours); setShowForm(false); } }}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg text-sm transition-colors"
          >
            Send request
          </button>
          <button onClick={() => setShowForm(false)} className="px-4 border border-neutral-700 text-neutral-300 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    ) : (
      <button onClick={() => setShowForm(true)} className="mt-4 w-full border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 text-sm font-semibold py-2.5 rounded-lg transition-colors">
        + Request on-site installation / service
      </button>
    );
  }

  if (fs.status === "pending") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <Badge tone="neutral">Service request sent</Badge>
        <p className="text-xs text-neutral-500 mt-2">Waiting on the supplier to confirm callout, travel and labour charges for {fs.siteAddress}.</p>
      </div>
    );
  }

  if (fs.status === "quoted") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <div className="text-white font-semibold text-sm mb-1">On-site service at {fs.siteAddress}</div>
        <p className="text-xs text-neutral-500 mb-3">Callout, travel and labour charges are included in the total above.</p>
        <button onClick={() => confirmFieldService(quote.id)} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg text-sm transition-colors">
          Confirm — I'm happy with this
        </button>
      </div>
    );
  }

  if (fs.status === "confirmed") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <Badge tone="green">On-site service confirmed</Badge>
        <div className="text-sm text-neutral-400 mt-2">{fs.siteAddress} — included in the total above</div>
      </div>
    );
  }

  return null;
}
