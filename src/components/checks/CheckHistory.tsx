// The "Checks" tab: every check on a machine, grouped by hose, newest first,
// with photos side by side so wear can be compared over time.

import { Trash2 } from "lucide-react";
import { Badge } from "../ui";
import { PhotoStrip } from "../photos/PhotoStrip";
import { conditionInfo, type HoseCheck } from "../../lib/checks";
import type { MachineHose } from "../../lib/machines";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function CheckHistory({
  hoses, checks, onDelete,
}: { hoses: MachineHose[]; checks: HoseCheck[]; onDelete: (c: HoseCheck) => void }) {
  if (checks.length === 0) {
    return (
      <div className="text-center py-10 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
        No checks yet. Do a quick walk-round with “Check hoses” — a photo of each hose every week or
        month builds a timeline that shows wear before it becomes a burst.
      </div>
    );
  }
  const name = (id: string | null) => hoses.find((h) => h.id === id)?.position ?? "Hose (not in register)";
  const groups = new Map<string, HoseCheck[]>();
  for (const c of checks) {
    const k = c.machineHoseId ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([hoseId, list]) => (
        <div key={hoseId} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-white font-semibold mb-3">{name(hoseId === "none" ? null : hoseId)}</div>
          <ol className="space-y-3">
            {list.map((c) => {
              const info = conditionInfo(c.condition);
              return (
                <li key={c.id} className="border-l-2 border-neutral-700 pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-neutral-400">{when(c.checkedAt)}</span>
                      <Badge tone={info.tone}>{info.label}</Badge>
                      {c.requestId && <span className="text-xs text-neutral-500">· quoted {c.requestId}</span>}
                    </div>
                    <button onClick={() => onDelete(c)} title="Delete check" aria-label="Delete check" className="p-1 text-neutral-600 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {c.notes && <p className="text-sm text-neutral-300 mt-1">{c.notes}</p>}
                  {c.photos.length > 0 && <div className="mt-2"><PhotoStrip photos={c.photos} size="w-24 h-24" alt="Check photo" /></div>}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
