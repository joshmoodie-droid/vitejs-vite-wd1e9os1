// One hose-assembly form block in the quote wizard. Stateless — all state
// lives in the parent form; this renders it and calls onChange / onRemove.
// Extracted verbatim from App.tsx.

import { Field, inputClass } from "./ui";
import { HOSE_TYPES, BORES, FITTING_TYPES, ORIENTATIONS, fittingBoresFor } from "../lib/catalog";

export function AssemblyCard({ assembly: a, index, errors, onChange, onRemove }: any) {
  const ek = (field) => errors[`asm_${index}_${field}`];
  const isFittingAvailable = (fittingType) => !a.bore || fittingBoresFor(fittingType).some((b) => b.key === a.bore);
  const onBoreChange = (bore) => {
    onChange("bore", bore);
    // Some fitting types (e.g. SAE flanges) aren't made in every size — drop
    // a selection that's no longer valid at the new bore rather than leave a
    // stale, impossible combination in place.
    ["A", "B"].forEach((side) => {
      const type = a[`fitting${side}Type`];
      if (type && !fittingBoresFor(type).some((b) => b.key === bore)) {
        onChange(`fitting${side}Type`, "");
      }
    });
  };
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-orange-500 text-xs font-bold tracking-wide">ASSEMBLY {index + 1}</div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-neutral-500 hover:text-red-400 font-semibold">
            Remove
          </button>
        )}
      </div>

      <Field label="Hose Category" required>
        <div className="grid grid-cols-2 gap-3">
          {["hydraulic_oil", "pressure_washer"].map((c) => (
            <button key={c} type="button" onClick={() => { onChange("category", c); onChange("bore", ""); onChange("hoseType", ""); }}
              className={`py-2.5 rounded-lg border font-semibold text-sm transition-colors ${a.category === c ? "border-orange-500 bg-orange-500/10 text-orange-500" : "border-neutral-700 text-neutral-300"}`}>
              {c === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Hose Type" required error={ek("hoseType")}>
        <select className={inputClass(ek("hoseType"))} value={a.hoseType} onChange={(e) => onChange("hoseType", e.target.value)}>
          <option className="bg-neutral-900 text-white" value="">Select type...</option>
          {HOSE_TYPES[a.category].map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Internal Diameter / Bore" required error={ek("bore")}>
        <select className={inputClass(ek("bore"))} value={a.bore} onChange={(e) => onBoreChange(e.target.value)}>
          <option className="bg-neutral-900 text-white" value="">Select bore...</option>
          {BORES[a.category].map((b) => <option className="bg-neutral-900 text-white" key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Length (metres)" required error={ek("length")}>
          <input type="number" step="0.1" placeholder="e.g. 2.5" className={inputClass(ek("length"))} value={a.length} onChange={(e) => onChange("length", e.target.value)} />
        </Field>
        <Field label="Quantity" required>
          <input type="number" min="1" className={inputClass()} value={a.quantity} onChange={(e) => onChange("quantity", e.target.value)} />
        </Field>
      </div>
      <Field label="Working Pressure" required error={ek("pressure")}>
        <div className="flex gap-3">
          <input type="number" placeholder="e.g. 3000" className={inputClass(ek("pressure"))} value={a.pressure} onChange={(e) => onChange("pressure", e.target.value)} />
          <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">PSI</div>
        </div>
      </Field>

      {["A", "B"].map((side) => (
        <div key={side} className="border border-neutral-800 rounded-lg p-3 mb-4">
          <div className="text-orange-500 text-xs font-bold tracking-wide mb-3">FITTING {side}</div>
          <Field label="Type" required error={ek(`fitting${side}Type`)}>
            <select className={inputClass(ek(`fitting${side}Type`))} value={a[`fitting${side}Type`]} onChange={(e) => onChange(`fitting${side}Type`, e.target.value)}>
              <option className="bg-neutral-900 text-white" value="">Select fitting...</option>
              {FITTING_TYPES.filter(isFittingAvailable).map((f) => <option className="bg-neutral-900 text-white" key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Orientation" required>
            <select className={inputClass()} value={a[`fitting${side}Orientation`]} onChange={(e) => onChange(`fitting${side}Orientation`, e.target.value)}>
              {ORIENTATIONS.map((o) => <option className="bg-neutral-900 text-white" key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      ))}
    </div>
  );
}
