// Add/edit forms for the maintenance register: machine, hose, service-log
// entry. Each owns its draft state, validates required fields, and hands the
// cleaned values to an async `onSave`; a failed save shows the error and keeps
// the form open so nothing typed is lost.

import { useState, type ReactNode } from "react";
import { Field, inputClass } from "../ui";
import { HOSE_TYPES, BORES, FITTING_TYPES, ORIENTATIONS, fittingBoresFor } from "../../lib/catalog";
import {
  SERVICE_KINDS,
  type Machine,
  type MachineHose,
  type ServiceLogEntry,
  type HoseSpec,
  type ServiceKind,
} from "../../lib/machines";

type MachineDraft = Omit<Machine, "id" | "createdAt">;
type HoseDraft = Omit<MachineHose, "id" | "machineId">;
type LogDraft = Omit<ServiceLogEntry, "id" | "machineId">;

const optionClass = "bg-neutral-900 text-white";

// ---------- shared form chrome ----------

function useSave<T>(onSave: (v: T) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (v: T) => {
    setSaving(true);
    setError("");
    try {
      await onSave(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
      setSaving(false);
    }
  };
  return { saving, error, save };
}

function FormShell({
  title, children, saving, error, onCancel, onSubmit,
}: {
  title: string; children: ReactNode; saving: boolean; error: string;
  onCancel: () => void; onSubmit: () => void;
}) {
  return (
    <form
      className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <h3 className="text-white font-bold text-lg mb-4">{title}</h3>
      {children}
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit" disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-5 py-2.5 rounded-lg"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold px-3">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- machine ----------

export function MachineForm({
  initial, title, onSave, onCancel,
}: { initial: MachineDraft; title: string; onSave: (m: MachineDraft) => Promise<void>; onCancel: () => void }) {
  const [m, setM] = useState(initial);
  const [nameError, setNameError] = useState("");
  const { saving, error, save } = useSave(onSave);
  const set = (k: keyof MachineDraft) => (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value });

  const submit = () => {
    if (!m.name.trim()) { setNameError("Give the machine a name"); return; }
    setNameError("");
    save(m);
  };

  return (
    <FormShell title={title} saving={saving} error={error} onCancel={onCancel} onSubmit={submit}>
      <Field label="Name" required error={nameError} hint="What you call it, e.g. “Kubota KX040” or “Truck 2”">
        <input className={inputClass(nameError)} value={m.name} onChange={set("name")} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Make"><input className={inputClass()} value={m.make} onChange={set("make")} placeholder="e.g. Kubota" /></Field>
        <Field label="Model"><input className={inputClass()} value={m.model} onChange={set("model")} placeholder="e.g. KX040-4" /></Field>
        <Field label="Year"><input type="number" min="1900" max="2100" className={inputClass()} value={m.year} onChange={set("year")} /></Field>
        <Field label="Hour meter / odometer"><input type="number" min="0" step="0.1" className={inputClass()} value={m.hours} onChange={set("hours")} /></Field>
        <Field label="Serial / VIN"><input className={inputClass()} value={m.serial} onChange={set("serial")} /></Field>
        <Field label="Rego"><input className={inputClass()} value={m.rego} onChange={set("rego")} /></Field>
      </div>
      <Field label="Site / location" hint="Where the machine usually is">
        <input className={inputClass()} value={m.site} onChange={set("site")} />
      </Field>
      <Field label="Notes">
        <textarea rows={2} className={inputClass()} value={m.notes} onChange={set("notes")} />
      </Field>
    </FormShell>
  );
}

// ---------- hose ----------

function HoseSpecFields({ spec, onChange }: { spec: HoseSpec; onChange: (s: HoseSpec) => void }) {
  const set = (patch: Partial<HoseSpec>) => onChange({ ...spec, ...patch });
  const fittingFits = (type: string) => !spec.bore || fittingBoresFor(type).some((b) => b.key === spec.bore);
  const setBore = (bore: string) => {
    // Drop a fitting that isn't made in the new size (e.g. small SAE flanges),
    // same rule as the quote form's AssemblyCard.
    const keep = (type: string) => (type && !fittingBoresFor(type).some((b) => b.key === bore) ? "" : type);
    set({ bore, fittingAType: keep(spec.fittingAType), fittingBType: keep(spec.fittingBType) });
  };

  return (
    <div className="border border-neutral-800 rounded-lg p-4 mb-5">
      <div className="text-orange-500 text-xs font-bold tracking-wide mb-3">HOSE SPEC (optional — fill in what you know)</div>
      <Field label="Hose category">
        <div className="grid grid-cols-2 gap-3">
          {(["hydraulic_oil", "pressure_washer"] as const).map((c) => (
            <button
              key={c} type="button"
              onClick={() => set({ category: c, bore: "", hoseType: "" })}
              className={`py-2.5 rounded-lg border font-semibold text-sm transition-colors ${spec.category === c ? "border-orange-500 bg-orange-500/10 text-orange-500" : "border-neutral-700 text-neutral-300"}`}
            >
              {c === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hose type">
          <select className={inputClass()} value={spec.hoseType} onChange={(e) => set({ hoseType: e.target.value })}>
            <option className={optionClass} value="">Not sure</option>
            {HOSE_TYPES[spec.category].map((t) => <option className={optionClass} key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Bore">
          <select className={inputClass()} value={spec.bore} onChange={(e) => setBore(e.target.value)}>
            <option className={optionClass} value="">Not sure</option>
            {BORES[spec.category].map((b) => <option className={optionClass} key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Length (metres)">
          <input type="number" min="0" step="0.01" className={inputClass()} value={spec.length} onChange={(e) => set({ length: e.target.value })} />
        </Field>
        <Field label="Working pressure (PSI)">
          <input type="number" min="0" className={inputClass()} value={spec.pressure} onChange={(e) => set({ pressure: e.target.value })} />
        </Field>
      </div>
      {(["A", "B"] as const).map((side) => {
        const typeKey = `fitting${side}Type` as const;
        const orientKey = `fitting${side}Orientation` as const;
        return (
          <div key={side} className="grid grid-cols-2 gap-4">
            <Field label={`Fitting ${side}`}>
              <select className={inputClass()} value={spec[typeKey]} onChange={(e) => set({ [typeKey]: e.target.value })}>
                <option className={optionClass} value="">Not sure</option>
                {FITTING_TYPES.filter(fittingFits).map((f) => <option className={optionClass} key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label={`Fitting ${side} orientation`}>
              <select className={inputClass()} value={spec[orientKey]} onChange={(e) => set({ [orientKey]: e.target.value })}>
                {ORIENTATIONS.map((o) => <option className={optionClass} key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
        );
      })}
    </div>
  );
}

export function HoseForm({
  initial, title, onSave, onCancel,
}: { initial: HoseDraft; title: string; onSave: (h: HoseDraft) => Promise<void>; onCancel: () => void }) {
  const [h, setH] = useState(initial);
  const [positionError, setPositionError] = useState("");
  const { saving, error, save } = useSave(onSave);

  const submit = () => {
    if (!h.position.trim()) { setPositionError("Say where this hose is on the machine"); return; }
    setPositionError("");
    save(h);
  };

  return (
    <FormShell title={title} saving={saving} error={error} onCancel={onCancel} onSubmit={submit}>
      <Field label="Position on machine" required error={positionError} hint="e.g. “Boom cylinder – left”, “Bucket ram”, “Tilt line”">
        <input className={inputClass(positionError)} value={h.position} onChange={(e) => setH({ ...h, position: e.target.value })} autoFocus />
      </Field>
      <HoseSpecFields spec={h.spec} onChange={(spec) => setH({ ...h, spec })} />
      <Field label="Date fitted">
        <input type="date" className={inputClass()} value={h.installedAt} onChange={(e) => setH({ ...h, installedAt: e.target.value })} />
      </Field>
      <Field label="Notes">
        <textarea rows={2} className={inputClass()} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
      </Field>
    </FormShell>
  );
}

// ---------- service log entry ----------

export function LogForm({
  initial, title, onSave, onCancel,
}: { initial: LogDraft; title: string; onSave: (e: LogDraft) => Promise<void>; onCancel: () => void }) {
  const [e, setE] = useState(initial);
  const [dateError, setDateError] = useState("");
  const { saving, error, save } = useSave(onSave);
  const set = (k: keyof LogDraft) => (ev: { target: { value: string } }) => setE({ ...e, [k]: ev.target.value });

  const submit = () => {
    if (!e.performedAt) { setDateError("Pick the date the work was done"); return; }
    setDateError("");
    save(e);
  };

  return (
    <FormShell title={title} saving={saving} error={error} onCancel={onCancel} onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="What was done" required>
          <select className={inputClass()} value={e.kind} onChange={(ev) => setE({ ...e, kind: ev.target.value as ServiceKind })}>
            {SERVICE_KINDS.map((k) => <option className={optionClass} key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Date" required error={dateError}>
          <input type="date" className={inputClass(dateError)} value={e.performedAt} onChange={set("performedAt")} />
        </Field>
        <Field label="Hours at the time">
          <input type="number" min="0" step="0.1" className={inputClass()} value={e.hours} onChange={set("hours")} />
        </Field>
        <Field label="Cost (A$)">
          <input type="number" min="0" step="0.01" className={inputClass()} value={e.cost} onChange={set("cost")} />
        </Field>
      </div>
      <Field label="Done by" hint="You, a staff member, or the supplier/mechanic">
        <input className={inputClass()} value={e.performedBy} onChange={set("performedBy")} />
      </Field>
      <Field label="Notes">
        <textarea rows={3} className={inputClass()} value={e.notes} onChange={set("notes")} placeholder="Parts used, what you found, follow-ups…" />
      </Field>
    </FormShell>
  );
}
