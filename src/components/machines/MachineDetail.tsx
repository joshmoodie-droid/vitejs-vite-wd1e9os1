// One machine: its details, hose register, service log and hose checks.
// Loads its own hoses/log/checks; machine edits and deletes are reported up
// to MyMachines so the list stays in sync.

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Pencil, Trash2, Plus, RotateCcw, Send, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Badge } from "../ui";
import { HoseCheckFlow } from "../checks/HoseCheckFlow";
import { CheckHistory } from "../checks/CheckHistory";
import {
  listChecks, deleteCheck, latestByHose, quoteFromChecks, conditionInfo,
  type HoseCheck,
} from "../../lib/checks";
import { MachineForm, HoseForm, LogForm } from "./forms";
import {
  listHoses, createHose, updateHose, deleteHose,
  listLog, createLogEntry, updateLogEntry, deleteLogEntry,
  updateMachine, deleteMachine,
  emptyHose, emptyLogEntry, describeHoseSpec, serviceKindLabel, assemblyFromHose,
  type Machine, type MachineHose, type ServiceLogEntry, type QuotePrefill,
} from "../../lib/machines";

const formatDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

type Tab = "hoses" | "checks" | "log";
// What's open in the current tab: nothing, an "add" form, or an edit form for one row.
type Editing = null | "new" | string;

export function MachineDetail({
  machine, userId, onQuote, onBack, onUpdated, onDeleted,
}: {
  machine: Machine;
  userId: string;
  onQuote: (prefill: QuotePrefill) => void;
  onBack: () => void;
  onUpdated: (m: Machine) => void;
  onDeleted: (id: string) => void;
}) {
  const [editingMachine, setEditingMachine] = useState(false);
  const [tab, setTab] = useState<Tab>("hoses");
  const [hoses, setHoses] = useState<MachineHose[] | null>(null);
  const [log, setLog] = useState<ServiceLogEntry[] | null>(null);
  const [checks, setChecks] = useState<HoseCheck[] | null>(null);
  // Hose check in progress: every hose on the machine, or just one.
  const [checking, setChecking] = useState<null | "all" | string>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listHoses(machine.id), listLog(machine.id), listChecks(machine.id)])
      .then(([h, l, c]) => { if (!cancelled) { setHoses(h); setLog(l); setChecks(c); } })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [machine.id]);

  const switchTab = (t: Tab) => { setTab(t); setEditing(null); setActionError(""); };

  // Deletes ask first and report failures inline; a failed delete leaves the row in place.
  const confirmAndRun = async (question: string, run: () => Promise<void>) => {
    if (!window.confirm(question)) return;
    setActionError("");
    try {
      await run();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't work — please try again.");
    }
  };

  const latest = latestByHose(checks ?? []);
  const wornQuote = hoses && checks ? quoteFromChecks(machine.id, hoses, checks) : null;
  const wornCount = wornQuote?.assemblies?.length ?? 0;

  const details = [
    [machine.make, machine.model].filter(Boolean).join(" "),
    machine.year && `${machine.year}`,
    machine.rego && `Rego ${machine.rego}`,
    machine.serial && `S/N ${machine.serial}`,
    machine.hours && `${machine.hours} hrs`,
    machine.site,
  ].filter(Boolean);

  if (checking && hoses) {
    return (
      <HoseCheckFlow
        machineId={machine.id}
        hoses={checking === "all" ? hoses : hoses.filter((h) => h.id === checking)}
        userId={userId}
        onCancel={() => setChecking(null)}
        onSaved={async (saved) => {
          setChecks((cs) => [...saved, ...(cs || [])].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)));
          setChecking(null);
          setTab("checks");
          // saveChecks added an "Inspection" entry to the service log
          listLog(machine.id).then(setLog).catch(() => {});
        }}
      />
    );
  }

  if (editingMachine) {
    return (
      <MachineForm
        title={`Edit ${machine.name}`}
        initial={machine}
        onCancel={() => setEditingMachine(false)}
        onSave={async (m) => {
          onUpdated(await updateMachine(machine.id, m));
          setEditingMachine(false);
        }}
      />
    );
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-semibold mb-4">
        <ArrowLeft className="w-4 h-4" /> My machines
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-white break-words">{machine.name}</h1>
          {details.length > 0 && <p className="text-neutral-400 text-sm mt-1">{details.join(" · ")}</p>}
          {machine.notes && <p className="text-neutral-500 text-sm mt-2 whitespace-pre-wrap">{machine.notes}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setChecking("all")}
              disabled={!hoses || hoses.length === 0}
              title={hoses?.length === 0 ? "Add the machine's hoses first" : undefined}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-black font-bold text-sm px-3 py-2 rounded-lg"
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> Check hoses
            </button>
            <button
              onClick={() => onQuote({ machineId: machine.id })}
              className="flex items-center gap-2 border border-orange-500/60 text-orange-400 hover:bg-orange-500/10 font-semibold text-sm px-3 py-2 rounded-lg"
            >
              <Send className="w-3.5 h-3.5" /> Get a hose quote
            </button>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setEditingMachine(true)} title="Edit machine" aria-label="Edit machine" className="p-2 text-neutral-400 hover:text-white">
            <Pencil className="w-4 h-4" />
          </button>
          <button
            title="Delete machine" aria-label="Delete machine" className="p-2 text-neutral-400 hover:text-red-400"
            onClick={() => confirmAndRun(
              `Delete ${machine.name}? Its hose register and service log will be deleted too.`,
              async () => { await deleteMachine(machine.id); onDeleted(machine.id); },
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {wornQuote && (
        <div className="mb-5 rounded-xl border border-orange-500/50 bg-orange-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-orange-300 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {wornCount} hose{wornCount === 1 ? "" : "s"} need{wornCount === 1 ? "s" : ""} replacing, from the latest check
          </div>
          <button
            onClick={() => onQuote(wornQuote)}
            className="bg-orange-500 hover:bg-orange-600 text-black font-bold text-sm px-3 py-2 rounded-lg"
          >
            Get a quote for {wornCount === 1 ? "it" : "them"}
          </button>
        </div>
      )}

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-5 w-fit max-w-full overflow-x-auto">
        {([
          ["hoses", `Hoses${hoses ? ` (${hoses.length})` : ""}`],
          ["checks", `Checks${checks ? ` (${checks.length})` : ""}`],
          ["log", `Log${log ? ` (${log.length})` : ""}`],
        ] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => switchTab(key)}
            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${tab === key ? "bg-orange-500 text-black" : "text-neutral-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && <p className="text-red-400 text-sm mb-4">Couldn't load this machine's records: {loadError}</p>}
      {actionError && <p className="text-red-400 text-sm mb-4">{actionError}</p>}

      {tab === "hoses" && (
        <Section
          loading={hoses === null && !loadError}
          empty={hoses?.length === 0}
          emptyText="No hoses recorded yet. Add each hose with where it sits on the machine — next time one fails you'll have the spec ready."
          addLabel="Add hose"
          adding={editing === "new"}
          onAdd={() => setEditing("new")}
          addForm={
            <HoseForm
              title="Add hose" initial={emptyHose()} onCancel={() => setEditing(null)}
              onSave={async (h) => {
                const created = await createHose(machine.id, h);
                setHoses((hs) => [...(hs || []), created].sort((a, b) => a.position.localeCompare(b.position)));
                setEditing(null);
              }}
            />
          }
        >
          {hoses?.map((h) => (
            <Fragment key={h.id}>
              {editing === h.id ? (
                <HoseForm
                  title={`Edit ${h.position}`} initial={h} onCancel={() => setEditing(null)}
                  onSave={async (draft) => {
                    const saved = await updateHose(h.id, draft);
                    setHoses((hs) => (hs || []).map((x) => (x.id === h.id ? saved : x)));
                    setEditing(null);
                  }}
                />
              ) : (
                <Row
                  title={h.position}
                  badge={latest.get(h.id) && conditionInfo(latest.get(h.id)!.condition)}
                  subtitle={describeHoseSpec(h.spec)}
                  meta={[h.installedAt && `Fitted ${formatDate(h.installedAt)}`, h.notes].filter(Boolean).join(" · ")}
                  actions={[
                    { label: "Check", icon: ClipboardCheck, onClick: () => setChecking(h.id) },
                    { label: "Order again", icon: RotateCcw, onClick: () => onQuote({ machineId: machine.id, assemblies: [assemblyFromHose(h)] }) },
                  ]}
                  onEdit={() => setEditing(h.id)}
                  onDelete={() => confirmAndRun(`Remove “${h.position}” from the hose register?`, async () => {
                    await deleteHose(h.id);
                    setHoses((hs) => (hs || []).filter((x) => x.id !== h.id));
                  })}
                />
              )}
            </Fragment>
          ))}
        </Section>
      )}

      {tab === "checks" && (
        checks === null && !loadError ? <p className="text-neutral-500">Loading…</p> : (
          <CheckHistory
            hoses={hoses || []}
            checks={checks || []}
            onDelete={(c) => confirmAndRun("Delete this check and its photos from the history?", async () => {
              await deleteCheck(c.id);
              setChecks((cs) => (cs || []).filter((x) => x.id !== c.id));
            })}
          />
        )
      )}

      {tab === "log" && (
        <Section
          loading={log === null && !loadError}
          empty={log?.length === 0}
          emptyText="No service history yet. Log services, inspections, greasing and repairs to build a full history for this machine."
          addLabel="Add log entry"
          adding={editing === "new"}
          onAdd={() => setEditing("new")}
          addForm={
            <LogForm
              title="Add log entry" initial={emptyLogEntry()} onCancel={() => setEditing(null)}
              onSave={async (e) => {
                const created = await createLogEntry(machine.id, e);
                setLog((l) => [created, ...(l || [])].sort((a, b) => b.performedAt.localeCompare(a.performedAt)));
                setEditing(null);
              }}
            />
          }
        >
          {log?.map((e) => (
            <Fragment key={e.id}>
              {editing === e.id ? (
                <LogForm
                  title="Edit log entry" initial={e} onCancel={() => setEditing(null)}
                  onSave={async (draft) => {
                    const saved = await updateLogEntry(e.id, draft);
                    setLog((l) => (l || []).map((x) => (x.id === e.id ? saved : x)).sort((a, b) => b.performedAt.localeCompare(a.performedAt)));
                    setEditing(null);
                  }}
                />
              ) : (
                <Row
                  title={`${serviceKindLabel(e.kind)} · ${formatDate(e.performedAt)}`}
                  subtitle={e.notes}
                  meta={[
                    e.hours && `${e.hours} hrs`,
                    e.cost && `A$${Number(e.cost).toFixed(2)}`,
                    e.performedBy && `by ${e.performedBy}`,
                  ].filter(Boolean).join(" · ")}
                  onEdit={() => setEditing(e.id)}
                  onDelete={() => confirmAndRun("Delete this log entry?", async () => {
                    await deleteLogEntry(e.id);
                    setLog((l) => (l || []).filter((x) => x.id !== e.id));
                  })}
                />
              )}
            </Fragment>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  loading, empty, emptyText, addLabel, adding, onAdd, addForm, children,
}: {
  loading: boolean; empty: boolean; emptyText: string; addLabel: string;
  adding: boolean; onAdd: () => void; addForm: ReactNode; children: ReactNode;
}) {
  if (loading) return <p className="text-neutral-500">Loading…</p>;
  return (
    <div className="space-y-3">
      {adding ? (
        addForm
      ) : (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg"
        >
          <Plus className="w-4 h-4" /> {addLabel}
        </button>
      )}
      {empty && !adding && (
        <div className="text-center py-10 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">{emptyText}</div>
      )}
      {children}
    </div>
  );
}

type RowAction = { label: string; icon: typeof Pencil; onClick: () => void };

function Row({
  title, badge, subtitle, meta, actions, onEdit, onDelete,
}: {
  title: string; badge?: { label: string; tone: string } | false; subtitle?: string; meta?: string;
  actions?: RowAction[];
  onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white font-semibold break-words">{title}</span>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        {subtitle && <div className="text-sm text-neutral-400 mt-0.5 whitespace-pre-wrap break-words">{subtitle}</div>}
        {meta && <div className="text-xs text-neutral-500 mt-1 break-words">{meta}</div>}
        {actions && actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {actions.map((a) => (
              <button
                key={a.label} onClick={a.onClick}
                className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 text-sm font-semibold"
              >
                <a.icon className="w-3.5 h-3.5" /> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} title="Edit" aria-label="Edit" className="p-2 text-neutral-500 hover:text-white">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onDelete} title="Delete" aria-label="Delete" className="p-2 text-neutral-500 hover:text-red-400">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
