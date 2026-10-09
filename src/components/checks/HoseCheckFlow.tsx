// "Check hoses": a walk-round of a machine. For each hose in its register the
// customer rates the condition and can add photos and notes; hoses left
// unrated are skipped. One hose at a time when opened from a single hose.

import { useState } from "react";
import { Field, inputClass } from "../ui";
import { PhotoUploader } from "../photos/PhotoUploader";
import { CONDITIONS, saveChecks, type CheckDraft, type HoseCheck } from "../../lib/checks";
import { describeHoseSpec, type MachineHose } from "../../lib/machines";

const toneClass: Record<string, string> = {
  green: "border-emerald-500 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500 bg-orange-500/10 text-orange-400",
  red: "border-red-500 bg-red-500/10 text-red-400",
};

export function HoseCheckFlow({
  machineId, hoses, userId, onCancel, onSaved,
}: {
  machineId: string;
  hoses: MachineHose[];
  userId: string;
  onCancel: () => void;
  onSaved: (checks: HoseCheck[]) => void;
}) {
  const [drafts, setDrafts] = useState<CheckDraft[]>(() =>
    hoses.map((h) => ({ machineHoseId: h.id, condition: "", notes: "", photos: [] })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rated = drafts.filter((d) => d.condition !== "").length;
  const single = hoses.length === 1;

  const set = (i: number, patch: Partial<CheckDraft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const save = async () => {
    if (rated === 0) { setError("Rate at least one hose before saving."); return; }
    setSaving(true);
    setError("");
    try {
      onSaved(await saveChecks(machineId, drafts));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the check — please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-bold text-lg">{single ? `Check ${hoses[0].position}` : "Check hoses"}</h3>
        <p className="text-neutral-500 text-sm">
          {single
            ? "Rate its condition and add a photo — over time you'll see wear develop."
            : "Rate each hose you look at and add a photo. Hoses you skip aren't recorded."}
        </p>
      </div>

      {hoses.map((h, i) => {
        const d = drafts[i];
        return (
          <div key={h.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="text-white font-semibold">{h.position}</div>
            <div className="text-xs text-neutral-500 mb-3">{describeHoseSpec(h.spec)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3" role="radiogroup" aria-label={`Condition of ${h.position}`}>
              {CONDITIONS.map((c) => (
                <button
                  key={c.key} type="button" role="radio" aria-checked={d.condition === c.key}
                  onClick={() => set(i, { condition: d.condition === c.key ? "" : c.key })}
                  className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    d.condition === c.key ? toneClass[c.tone] : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {d.condition !== "" && (
              <>
                <Field label="Photos">
                  <PhotoUploader
                    userId={userId} value={d.photos} onChange={(photos) => set(i, { photos })}
                    hint="Get close: the worn spot, both fittings, and the printing on the hose."
                  />
                </Field>
                <Field label="Notes">
                  <input
                    className={inputClass()} value={d.notes} onChange={(e) => set(i, { notes: e.target.value })}
                    placeholder="e.g. cover rubbing on the boom, weeping at the fitting"
                  />
                </Field>
              </>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={save} disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-5 py-2.5 rounded-lg"
        >
          {saving ? "Saving…" : single ? "Save check" : `Save check${rated ? ` (${rated} hose${rated === 1 ? "" : "s"})` : ""}`}
        </button>
        <button onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold px-3">Cancel</button>
      </div>
    </div>
  );
}
