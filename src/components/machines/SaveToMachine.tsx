// "Save to a machine" for a past quote job that wasn't linked to a machine
// when it was requested: pick a machine, name where each hose sits, and the
// hoses plus a service-log entry go into the register. (Jobs that *were*
// linked are written automatically when the supplier marks them complete —
// see migration 0013.)

import { useEffect, useState } from "react";
import { Field, inputClass } from "../ui";
import {
  listMachines, createHose, createLogEntry, hoseSpecFromAssembly, describeHoseSpec, emptyLogEntry,
  type Machine,
} from "../../lib/machines";

export function SaveToMachine({
  requestId, assemblies, supplierId, onSaved, onCancel, onAddMachine,
}: {
  requestId: string;
  assemblies: Record<string, unknown>[];
  supplierId: string | null;
  onSaved: (machineName: string) => void;
  onCancel: () => void;
  onAddMachine: () => void;
}) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [machineId, setMachineId] = useState("");
  const [date, setDate] = useState(emptyLogEntry().performedAt);
  const [positions, setPositions] = useState<string[]>(() => assemblies.map(() => ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listMachines()
      .then((m) => {
        if (cancelled) return;
        setMachines(m);
        if (m.length === 1) setMachineId(m[0].id);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (!machineId) { setError("Pick which machine these hoses are on."); return; }
    setSaving(true);
    setError("");
    try {
      const link = { requestId, supplierId };
      // Sequential so a failure part-way leaves a clear, small set of rows.
      for (const [i, a] of assemblies.entries()) {
        await createHose(machineId, {
          position: positions[i].trim() || `Hose from job ${requestId}`,
          spec: hoseSpecFromAssembly(a),
          installedAt: date,
          notes: "",
        }, link);
      }
      await createLogEntry(machineId, {
        ...emptyLogEntry(), kind: "hose_replaced", performedAt: date, notes: `HoseQuote job ${requestId}`,
      }, link);
      onSaved(machines?.find((m) => m.id === machineId)?.name ?? "your machine");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
      setSaving(false);
    }
  };

  if (machines === null && !error) return <p className="text-neutral-500 text-sm mt-3">Loading your machines…</p>;

  if (machines?.length === 0) {
    return (
      <div className="mt-3 text-sm text-neutral-400">
        You haven't added any machines yet.{" "}
        <button onClick={onAddMachine} className="text-orange-500 hover:text-orange-400 font-semibold">Add one in My machines</button>{" "}
        first, then come back to save this job to it.{" "}
        <button onClick={onCancel} className="text-neutral-500 hover:text-white">Cancel</button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-neutral-800 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Machine" required>
          <select className={inputClass()} value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option className="bg-neutral-900 text-white" value="">Choose…</option>
            {machines?.map((m) => <option className="bg-neutral-900 text-white" key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Date fitted">
          <input type="date" className={inputClass()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {assemblies.map((a, i) => (
        <Field key={String(a.id ?? i)} label={`Where is hose ${i + 1} on the machine?`} hint={describeHoseSpec(hoseSpecFromAssembly(a))}>
          <input
            className={inputClass()} placeholder="e.g. Boom cylinder – left" value={positions[i]}
            onChange={(e) => setPositions((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
          />
        </Field>
      ))}
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={save} disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
        >
          {saving ? "Saving…" : "Save to register"}
        </button>
        <button onClick={onCancel} className="text-neutral-400 hover:text-white font-semibold text-sm px-2">Cancel</button>
      </div>
    </div>
  );
}
