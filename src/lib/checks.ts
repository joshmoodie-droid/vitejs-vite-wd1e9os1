// Customer hose checks (migration 0015): a condition rating, notes and photos
// for one hose at one point in time. Runs as the signed-in customer; RLS
// limits everything to their own machines.

import { supabase } from "../supabaseClient";
import { photoPaths } from "./photos";
import { createLogEntry, emptyLogEntry, assemblyFromHose, type MachineHose, type QuotePrefill } from "./machines";

export const CONDITIONS = [
  { key: "ok", label: "OK", tone: "green" },
  { key: "watch", label: "Watch", tone: "amber" },
  { key: "replace_soon", label: "Replace soon", tone: "orange" },
  { key: "leaking", label: "Leaking now", tone: "red" },
] as const;

export type Condition = (typeof CONDITIONS)[number]["key"];

export const conditionInfo = (c: string) => CONDITIONS.find((x) => x.key === c) ?? CONDITIONS[0];
export const needsReplacing = (c: string) => c === "replace_soon" || c === "leaking";

export type HoseCheck = {
  id: string;
  machineId: string;
  machineHoseId: string | null;
  checkedAt: string;
  condition: Condition;
  notes: string;
  photos: string[];
  requestId: string | null;
};

// What the check form collects for one hose before it's saved.
export type CheckDraft = {
  machineHoseId: string | null;
  condition: Condition | "";
  notes: string;
  photos: string[];
};

type Row = Record<string, unknown>;

function checkFromRow(r: Row): HoseCheck {
  return {
    id: String(r.id),
    machineId: String(r.machine_id),
    machineHoseId: r.machine_hose_id ? String(r.machine_hose_id) : null,
    checkedAt: String(r.checked_at),
    condition: String(r.condition) as Condition,
    notes: r.notes ? String(r.notes) : "",
    photos: photoPaths(r.photos),
    requestId: r.request_id ? String(r.request_id) : null,
  };
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// All checks on a machine, newest first.
export async function listChecks(machineId: string): Promise<HoseCheck[]> {
  const rows = unwrap<Row[]>(
    await supabase.from("hose_checks").select("*").eq("machine_id", machineId).order("checked_at", { ascending: false }),
  );
  return rows.map(checkFromRow);
}

// Save a walk-round: one row per hose that was rated, plus one "Inspection"
// entry in the machine's service log summarising it. Unrated hoses are skipped.
export async function saveChecks(machineId: string, drafts: CheckDraft[]): Promise<HoseCheck[]> {
  const rated = drafts.filter((d) => d.condition !== "");
  if (rated.length === 0) return [];
  const rows = unwrap<Row[]>(
    await supabase
      .from("hose_checks")
      .insert(rated.map((d) => ({
        machine_id: machineId,
        machine_hose_id: d.machineHoseId,
        condition: d.condition,
        notes: d.notes.trim() || null,
        photos: d.photos,
      })))
      .select(),
  );
  const counts = CONDITIONS
    .map((c) => [c.label, rated.filter((d) => d.condition === c.key).length] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label.toLowerCase()}`);
  await createLogEntry(machineId, {
    ...emptyLogEntry(),
    kind: "inspection",
    notes: `Hose check: ${rated.length} hose${rated.length === 1 ? "" : "s"} — ${counts.join(", ")}`,
  });
  return rows.map(checkFromRow);
}

export async function deleteCheck(id: string): Promise<void> {
  unwrap(await supabase.from("hose_checks").delete().eq("id", id));
}

// Latest check per hose (checks must be newest-first, as listChecks returns).
export function latestByHose(checks: HoseCheck[]): Map<string, HoseCheck> {
  const out = new Map<string, HoseCheck>();
  for (const c of checks) if (c.machineHoseId && !out.has(c.machineHoseId)) out.set(c.machineHoseId, c);
  return out;
}

// Quote prefill for every hose whose latest check says it needs replacing:
// its spec as an assembly, the check photos attached, priority urgency if
// anything is leaking.
export function quoteFromChecks(machineId: string, hoses: MachineHose[], checks: HoseCheck[]): QuotePrefill | null {
  const latest = latestByHose(checks);
  const worn = hoses.filter((h) => needsReplacing(latest.get(h.id)?.condition ?? ""));
  if (worn.length === 0) return null;
  const photos = worn.flatMap((h) => latest.get(h.id)!.photos);
  const leaking = worn.some((h) => latest.get(h.id)!.condition === "leaking");
  return {
    machineId,
    assemblies: worn.map(assemblyFromHose),
    photos: photos.slice(0, 3),
    urgency: leaking ? "priority" : "standard",
    notes: worn
      .map((h) => {
        const c = latest.get(h.id)!;
        return `${h.position}: ${conditionInfo(c.condition).label}${c.notes ? ` — ${c.notes}` : ""}`;
      })
      .join("\n"),
  };
}
