// The supplier/admin pricing editor. Extracted verbatim from App.tsx.
// PricingAdmin holds a local working copy of the pricing object and calls
// onSave; PricingGroup is its per-section editor (hose / fitting rows).

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Field, inputClass } from "./ui";
import { slugify } from "../lib/util";

export function PricingAdmin({ pricing, onSave }: any) {
  const [local, setLocal] = useState(pricing);
  const [saving, setSaving] = useState(false);
  useEffect(() => setLocal(pricing), [pricing]);

  const updateItem = (group, key, field, value) => {
    setLocal((p) => ({ ...p, [group]: { ...p[group], [key]: { ...p[group][key], [field]: field === "price" ? (parseFloat(value) || 0) : value } } }));
  };

  const addItem = (group, label, price, partNumber) => {
    const key = slugify(label);
    setLocal((p) => ({ ...p, [group]: { ...p[group], [key]: { label, price: parseFloat(price) || 0, partNumber: partNumber || "" } } }));
  };

  const save = async () => { setSaving(true); await onSave(local); setSaving(false); };

  if (!local) return null;

  return (
    <div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <div className="text-white font-bold mb-3">Base Rates</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Labour Rate ($ / job)">
            <input type="number" className={inputClass()} value={local.labourBase} onChange={(e) => setLocal((p) => ({ ...p, labourBase: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Crimp Charge ($ / fitting)">
            <input type="number" className={inputClass()} value={local.crimpCharge} onChange={(e) => setLocal((p) => ({ ...p, crimpCharge: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Travel Rate ($ base)">
            <input type="number" className={inputClass()} value={local.travelBase} onChange={(e) => setLocal((p) => ({ ...p, travelBase: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Callout Fee ($ default, on-site jobs)">
            <input type="number" className={inputClass()} value={local.calloutFee ?? 65} onChange={(e) => setLocal((p) => ({ ...p, calloutFee: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Labour Hourly Rate ($ / hour, field service)">
            <input type="number" className={inputClass()} value={local.labourHourlyRate ?? 85} onChange={(e) => setLocal((p) => ({ ...p, labourHourlyRate: parseFloat(e.target.value) || 0 }))} />
          </Field>
        </div>
      </div>

      <PricingGroup title="Hose Pricing (per metre)" data={local.hose} onChange={(k, f, v) => updateItem("hose", k, f, v)} onAdd={(label, price, part) => addItem("hose", label, price, part)} addLabel="Add hose type" />
      <PricingGroup title="Fitting Pricing (per item)" data={local.fitting} onChange={(k, f, v) => updateItem("fitting", k, f, v)} onAdd={(label, price, part) => addItem("fitting", label, price, part)} addLabel="Add fitting type" />

      <button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}

function PricingGroup({ title, data, onChange, onAdd, addLabel }: any) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newPart, setNewPart] = useState("");

  const submitAdd = () => {
    if (!newLabel || !newPrice) return;
    onAdd(newLabel, newPrice, newPart);
    setNewLabel(""); setNewPrice(""); setNewPart(""); setAdding(false);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white font-bold">{title}</div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-400">
            <Plus className="w-3.5 h-3.5" /> {addLabel}
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-black/40 border border-neutral-800 rounded-lg p-3 mb-3 space-y-2">
          <input placeholder="Label (e.g. 6-wire spiral SAE 100R15)" className={inputClass()} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Price ($)" className={inputClass()} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <input placeholder="Part number" className={inputClass()} value={newPart} onChange={(e) => setNewPart(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={submitAdd} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors">Add</button>
            <button onClick={() => setAdding(false)} className="flex-1 border border-neutral-700 text-neutral-300 py-2 rounded-lg text-sm transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-neutral-800">
        {Object.entries(data).map(([key, item]: [string, any]) => (
          <div key={key} className="py-3">
            <input
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-orange-500 rounded-lg text-white text-sm font-medium mb-2 px-3 py-2 outline-none transition-colors"
              value={item.label}
              onChange={(e) => onChange(key, "label", e.target.value)}
            />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-500 text-xs whitespace-nowrap">Part #</span>
                <input placeholder="—" className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-sm" value={item.partNumber || ""} onChange={(e) => onChange(key, "partNumber", e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">$</span>
                <input type="number" step="0.5" className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-right" value={item.price} onChange={(e) => onChange(key, "price", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
