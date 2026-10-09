// "My machines": the signed-in customer's maintenance register. Lists their
// machines and opens one at a time in MachineDetail. Sign-in is enforced by
// the caller (App.tsx) and, underneath, by RLS on the tables.

import { useEffect, useState } from "react";
import { Plus, Tractor, ChevronRight } from "lucide-react";
import { MachineForm } from "./forms";
import { MachineDetail } from "./MachineDetail";
import { listMachines, createMachine, emptyMachine, type Machine, type QuotePrefill } from "../../lib/machines";

export function MyMachines({ userId, email, onQuote }: { userId: string; email?: string; onQuote: (prefill: QuotePrefill) => void }) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMachines()
      .then((m) => { if (!cancelled) setMachines(m); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const byName = (a: Machine, b: Machine) => a.name.localeCompare(b.name);
  const open = machines?.find((m) => m.id === openId);

  if (open) {
    return (
      <MachineDetail
        machine={open}
        userId={userId}
        onQuote={onQuote}
        onBack={() => setOpenId(null)}
        onUpdated={(m) => setMachines((ms) => (ms || []).map((x) => (x.id === m.id ? m : x)).sort(byName))}
        onDeleted={(id) => { setMachines((ms) => (ms || []).filter((x) => x.id !== id)); setOpenId(null); }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">My machines</h1>
          <p className="text-neutral-500 text-sm">
            Your maintenance register — hoses and service history for each machine{email ? ` · ${email}` : ""}
          </p>
        </div>
        {!adding && machines !== null && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg shrink-0"
          >
            <Plus className="w-4 h-4" /> Add machine
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-6">
          <MachineForm
            title="Add machine"
            initial={emptyMachine()}
            onCancel={() => setAdding(false)}
            onSave={async (m) => {
              const created = await createMachine(m);
              setMachines((ms) => [...(ms || []), created].sort(byName));
              setAdding(false);
              setOpenId(created.id);
            }}
          />
        </div>
      )}

      {loadError && <p className="text-red-400 text-sm">Couldn't load your machines: {loadError}</p>}
      {machines === null && !loadError && <p className="text-neutral-500">Loading…</p>}

      {machines?.length === 0 && !adding && (
        <div className="text-center py-12 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          <Tractor className="w-8 h-8 mx-auto mb-3 text-neutral-600" />
          No machines yet. Add your excavators, loaders, trucks, tractors or anything
          else with hydraulic hoses — then record its hoses and service history.
        </div>
      )}

      <div className="space-y-3">
        {machines?.map((m) => (
          <button
            key={m.id}
            onClick={() => setOpenId(m.id)}
            className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-5 transition-colors flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-white font-semibold break-words">{m.name}</div>
              <div className="text-sm text-neutral-400">
                {[[m.make, m.model].filter(Boolean).join(" "), m.rego && `Rego ${m.rego}`, m.site].filter(Boolean).join(" · ") || "No details yet"}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-neutral-600 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
