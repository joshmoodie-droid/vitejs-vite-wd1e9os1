// Supplier-side quote pricing editors, extracted verbatim from App.tsx:
// - ActiveQuoteEditor: admin edit of an already-active quote (JobQuoteCard)
// - SupplierFieldServiceReview: price the on-site portion of a hose quote (JobQuoteCard)
// - AutoQuoteReview: review/adjust an auto-generated quote before sending (RequestCard)

import { useState } from "react";
import { inputClass } from "./ui";

export function ActiveQuoteEditor({ quote, onSave }: any) {
  const [priceLow, setPriceLow] = useState(quote.priceLow ?? 0);
  const [priceHigh, setPriceHigh] = useState(quote.priceHigh ?? 0);
  const [leadTime, setLeadTime] = useState(quote.leadTimeDays ?? 3);
  const [calloutFee, setCalloutFee] = useState(quote.calloutFee ?? quote.fieldService?.calloutFee ?? 65);
  const [travelCharge, setTravelCharge] = useState(quote.travelCharge ?? quote.fieldService?.travelCharge ?? 45);
  const [labour, setLabour] = useState(quote.labour ?? quote.fieldService?.labour ?? 0);

  const showOnSiteFields = quote.isBooking || (quote.fieldService && quote.fieldService.requested);

  const save = () => {
    const overrides: any = {
      priceLow: parseFloat(priceLow) || 0,
      priceHigh: parseFloat(priceHigh) || 0,
      leadTimeDays: parseInt(leadTime) || 1,
    };
    if (quote.isBooking) {
      overrides.calloutFee = parseFloat(calloutFee) || 0;
      overrides.travelCharge = parseFloat(travelCharge) || 0;
      overrides.labour = parseFloat(labour) || 0;
    } else if (quote.fieldService && quote.fieldService.requested) {
      overrides.fieldService = { ...quote.fieldService, calloutFee: parseFloat(calloutFee) || 0, travelCharge: parseFloat(travelCharge) || 0, labour: parseFloat(labour) || 0 };
    }
    onSave(overrides);
  };

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">{quote.isBooking ? "Total low $" : "Hose low $"}</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={priceLow} onChange={(e) => setPriceLow(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">{quote.isBooking ? "Total high $" : "Hose high $"}</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} />
        </div>
      </div>
      {showOnSiteFields && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Callout $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={calloutFee} onChange={(e) => setCalloutFee(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Travel $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travelCharge} onChange={(e) => setTravelCharge(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Labour $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labour} onChange={(e) => setLabour(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
        <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
      </div>
      <button onClick={save} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors">Save changes</button>
    </div>
  );
}

export function SupplierFieldServiceReview({ quote, pricing, onUpdate }: any) {
  const fs = quote.fieldService;
  const [callout, setCallout] = useState(fs.calloutFee);
  const [travel, setTravel] = useState(fs.travelCharge);
  const [labourHours, setLabourHours] = useState(fs.customerLabourHours || 1);
  const [hourlyRate, setHourlyRate] = useState(pricing?.labourHourlyRate ?? 85);

  const labour = Math.round((parseFloat(labourHours) || 0) * (parseFloat(hourlyRate) || 0));

  if (fs.status === "quoted" || fs.status === "confirmed") {
    return (
      <div className="border border-neutral-800 rounded-lg p-3 mt-3 text-sm">
        <div className="text-white font-semibold mb-1">On-site service — {fs.status === "confirmed" ? "confirmed by customer" : "sent to customer"}</div>
        <div className="text-neutral-400">{fs.siteAddress} — included in total above</div>
      </div>
    );
  }

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mt-3 space-y-3">
      <div className="text-white font-semibold text-sm">On-site service requested</div>
      <div className="text-sm text-neutral-400">{fs.siteAddress}</div>
      {fs.accessNotes && <div className="text-sm text-neutral-500">{fs.accessNotes}</div>}
      {fs.customerLabourHours && (
        <div className="text-xs text-orange-400 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
          Customer's own time estimate: {fs.customerLabourHours} hour{parseFloat(fs.customerLabourHours) !== 1 ? "s" : ""} — adjust hours and rate below to set the actual cost.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Callout fee $</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={callout} onChange={(e) => setCallout(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Travel charge $</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travel} onChange={(e) => setTravel(e.target.value)} />
        </div>
      </div>
      <div className="border border-neutral-700 rounded-lg p-2.5">
        <label className="text-xs text-neutral-500 block mb-1.5">Labour</label>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Hours</label>
            <input type="number" step="0.5" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labourHours} onChange={(e) => setLabourHours(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600 block mb-1">$ / hour</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </div>
          <div className="text-center pb-2">
            <div className="text-xs text-neutral-600 mb-1">= Labour $</div>
            <div className="text-white font-bold">${labour}</div>
          </div>
        </div>
      </div>
      <button
        onClick={() => onUpdate(quote.id, parseFloat(callout) || fs.calloutFee, parseFloat(travel) || fs.travelCharge, labourHours, hourlyRate)}
        className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors"
      >
        Send to customer
      </button>
    </div>
  );
}

export function AutoQuoteReview({ quote, onConfirmQuote, onRejectQuote }: any) {
  const [priceLow, setPriceLow] = useState(quote.priceLow ?? 0);
  const [priceHigh, setPriceHigh] = useState(quote.priceHigh ?? 0);
  const [leadTime, setLeadTime] = useState(quote.leadTimeDays ?? 3);
  const [calloutFee, setCalloutFee] = useState(quote.calloutFee ?? 65);
  const [travelCharge, setTravelCharge] = useState(quote.travelCharge ?? 45);
  const [labourHours, setLabourHours] = useState(quote.customerLabourHours || 1);
  const [hourlyRate, setHourlyRate] = useState(85);

  if (quote.isBooking) {
    const labour = Math.round((parseFloat(labourHours) || 0) * (parseFloat(hourlyRate) || 0));
    const total = (parseFloat(calloutFee) || 0) + (parseFloat(travelCharge) || 0) + labour;
    const confirm = () => {
      onConfirmQuote(quote.id, {
        calloutFee: parseFloat(calloutFee) || 0,
        travelCharge: parseFloat(travelCharge) || 0,
        labour,
        priceLow: total,
        priceHigh: total,
        leadTimeDays: parseInt(leadTime) || 1,
      });
    };
    return (
      <div className="space-y-3 mt-1">
        <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">Review pricing before sending to customer</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Callout fee $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={calloutFee} onChange={(e) => setCalloutFee(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Travel charge $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travelCharge} onChange={(e) => setTravelCharge(e.target.value)} />
          </div>
        </div>
        <div className="border border-neutral-700 rounded-lg p-2.5">
          <label className="text-xs text-neutral-500 block mb-1.5">Labour</label>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Hours</label>
              <input type="number" step="0.5" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labourHours} onChange={(e) => setLabourHours(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-600 block mb-1">$ / hour</label>
              <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </div>
            <div className="text-center pb-2">
              <div className="text-xs text-neutral-600 mb-1">= Labour $</div>
              <div className="text-white font-bold">${labour}</div>
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
          <span className="text-sm font-bold text-orange-500">Total to customer</span>
          <span className="text-lg font-extrabold text-orange-500">${total}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={confirm} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">Confirm &amp; send to customer</button>
          <button onClick={() => onRejectQuote(quote.id)} className="flex-1 border border-neutral-700 hover:border-red-500 hover:text-red-400 text-neutral-300 py-2.5 rounded-lg transition-colors">Reject</button>
        </div>
      </div>
    );
  }

  const confirm = () => {
    onConfirmQuote(quote.id, {
      priceLow: parseFloat(priceLow) || 0,
      priceHigh: parseFloat(priceHigh) || 0,
      leadTimeDays: parseInt(leadTime) || 1,
    });
  };

  return (
    <div className="space-y-3 mt-1">
      <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">Review pricing before sending to customer</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Low $</label>
          <input type="number" className={inputClass()} value={priceLow} onChange={(e) => setPriceLow(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">High $</label>
          <input type="number" className={inputClass()} value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
        <input type="number" className={inputClass()} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button onClick={confirm} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">Confirm &amp; send to customer</button>
        <button onClick={() => onRejectQuote(quote.id)} className="flex-1 border border-neutral-700 hover:border-red-500 hover:text-red-400 text-neutral-300 py-2.5 rounded-lg transition-colors">Reject</button>
      </div>
    </div>
  );
}
