// "Which machine is this for?" in the quote form. Signed-in customers only,
// and only once they have machines in their register. Linking a request to a
// machine means the job is written into that machine's service log and hose
// register when the supplier marks it complete.

import { useEffect, useState } from "react";
import { Tractor } from "lucide-react";
import { Field, inputClass } from "../ui";
import { listMachines, type Machine } from "../../lib/machines";

export function MachinePicker({ value, onChange }: { value: string; onChange: (machineId: string) => void }) {
  const [machines, setMachines] = useState<Machine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A failed load just hides the picker — the quote form must keep working.
    listMachines()
      .then((m) => { if (!cancelled) setMachines(m); })
      .catch(() => { if (!cancelled) setMachines([]); });
    return () => { cancelled = true; };
  }, []);

  if (!machines || machines.length === 0) return null;

  return (
    <div className="border border-neutral-800 rounded-lg p-4 mb-5">
      <div className="flex items-center gap-2 text-orange-500 text-xs font-bold tracking-wide mb-3">
        <Tractor className="w-3.5 h-3.5" /> MAINTENANCE REGISTER
      </div>
      <Field label="Which machine is this for?" hint="When the job's done we'll add it to that machine's service history and hose register.">
        <select className={inputClass()} value={value} onChange={(e) => onChange(e.target.value)}>
          <option className="bg-neutral-900 text-white" value="">Not for a specific machine</option>
          {machines.map((m) => (
            <option className="bg-neutral-900 text-white" key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
