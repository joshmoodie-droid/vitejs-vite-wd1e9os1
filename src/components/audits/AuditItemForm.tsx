// One audited hose: which machine and where on it, condition, photos, what
// to do about it, and the hose spec (so a replacement can be quoted later).

import { useState } from "react";
import { Field, inputClass } from "../ui";
import { PhotoUploader } from "../photos/PhotoUploader";
import { HoseSpecFields } from "../machines/forms";
import { CONDITIONS } from "../../lib/checks";
import { AUDIT_ACTIONS, type AuditItemDraft, type AuditAction } from "../../lib/audits";

const toneClass: Record<string, string> = {
  green: "border-emerald-500 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500 bg-orange-500/10 text-orange-400",
  red: "border-red-500 bg-red-500/10 text-red-400",
};

// A sensible default action for each condition; the supplier can change it.
const ACTION_FOR: Record<string, AuditAction> = {
  ok: "none", watch: "monitor", replace_soon: "replace_next_service", leaking: "replace_now",
};

export function AuditItemForm({
  title, initial, machineLabels, userId, onSave, onCancel,
}: {
  title: string;
  initial: AuditItemDraft;
  machineLabels: string[];
  userId: string;
  onSave: (d: AuditItemDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<AuditItemDraft>) => setD((x) => ({ ...x, ...patch }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!d.machineLabel.trim()) e.machineLabel = "Which machine is this hose on?";
    if (!d.position.trim()) e.position = "Where on the machine is it?";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError("");
    try {
      await onSave(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — please try again.");
      setSaving(false);
    }
  };

  return (
    <form className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h3 className="text-white font-bold text-lg mb-4">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Machine" required error={errors.machineLabel}>
          <input
            list="audit-machine-labels" className={inputClass(errors.machineLabel)} value={d.machineLabel}
            onChange={(e) => set({ machineLabel: e.target.value })} placeholder="e.g. Kubota KX040"
          />
          <datalist id="audit-machine-labels">
            {machineLabels.map((m) => <option key={m} value={m} />)}
          </datalist>
        </Field>
        <Field label="Position" required error={errors.position}>
          <input className={inputClass(errors.position)} value={d.position} onChange={(e) => set({ position: e.target.value })} placeholder="e.g. Boom left" />
        </Field>
      </div>
      <Field label="Condition" required>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Condition">
          {CONDITIONS.map((c) => (
            <button
              key={c.key} type="button" role="radio" aria-checked={d.condition === c.key}
              onClick={() => set({ condition: c.key, action: ACTION_FOR[c.key] })}
              className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${d.condition === c.key ? toneClass[c.tone] : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Photos">
        <PhotoUploader userId={userId} value={d.photos} onChange={(photos) => set({ photos })} hint="Show the customer what you saw: wear, damage, the fittings and the layline." />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Recommendation">
          <select className={inputClass()} value={d.action} onChange={(e) => set({ action: e.target.value as AuditAction })}>
            {AUDIT_ACTIONS.map((a) => <option className="bg-neutral-900 text-white" key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Notes for the customer">
          <input className={inputClass()} value={d.recommendation} onChange={(e) => set({ recommendation: e.target.value })} placeholder="e.g. Cover worn through where it rubs the boom" />
        </Field>
      </div>
      <HoseSpecFields spec={d.spec} onChange={(spec) => set({ spec })} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-5 py-2.5 rounded-lg">
          {saving ? "Saving…" : "Save hose"}
        </button>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold px-3">Cancel</button>
      </div>
    </form>
  );
}
