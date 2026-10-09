// Supplier view of one audit: customer and booking details, schedule and fee,
// every audited hose grouped by machine, overall findings, and completion.

import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { Badge, Field, inputClass } from "../ui";
import { PhotoStrip } from "../photos/PhotoStrip";
import { AuditItemForm } from "./AuditItemForm";
import { conditionInfo } from "../../lib/checks";
import { describeHoseSpec } from "../../lib/machines";
import {
  AUDIT_STATUSES, auditStatusInfo, auditActionLabel, auditTotal, money,
  listAuditItems, createAuditItem, updateAuditItem, deleteAuditItem, updateAudit, emptyAuditItem,
  type Audit, type AuditDraft, type AuditItem,
} from "../../lib/audits";

export function AuditEditor({
  audit, userId, onBack, onUpdated,
}: {
  audit: Audit;
  userId: string;
  onBack: () => void;
  onUpdated: (a: Audit) => void;
}) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [newLabel, setNewLabel] = useState("");
  const [draft, setDraft] = useState<AuditDraft>(audit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listAuditItems(audit.id)
      .then((i) => { if (!cancelled) setItems(i); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [audit.id]);

  const labels: string[] = [...new Set<string>((items ?? []).map((i: AuditItem) => i.machineLabel))];
  const total = auditTotal({ ...draft, machinesCount: audit.machinesCount }, items ?? undefined);
  const machineCount = labels.length || Number(audit.machinesCount || 0);
  const replaceCount = (items ?? []).filter((i) => i.action === "replace_now" || i.action === "replace_next_service").length;
  const dirty = (Object.keys(draft) as (keyof AuditDraft)[]).some((k) => draft[k] !== audit[k]);

  const save = async (next: AuditDraft) => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateAudit(audit.id, next);
      onUpdated(saved);
      setDraft(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const setD = (patch: Partial<AuditDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const sortItems = (list: AuditItem[]) =>
    [...list].sort((a, b) => a.machineLabel.localeCompare(b.machineLabel) || 0);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-semibold mb-4">
        <ArrowLeft className="w-4 h-4" /> All audits
      </button>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-white break-words">{audit.customerName}</h2>
          <p className="text-neutral-400 text-sm">
            {[audit.customerPhone, audit.customerEmail].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          <p className="text-neutral-500 text-sm">{[audit.siteAddress, audit.location].filter(Boolean).join(", ")}</p>
        </div>
        <Badge tone={auditStatusInfo(audit.status).tone}>{auditStatusInfo(audit.status).label}</Badge>
      </div>

      {audit.source === "customer" && (audit.notes || audit.preferredTime || audit.machinesCount) && (
        <div className="bg-black/30 rounded-lg p-3 text-sm text-neutral-300 mb-4 space-y-1">
          <div className="text-neutral-500 text-xs font-semibold uppercase tracking-wide">Booked by the customer</div>
          {audit.machinesCount && <div><span className="text-neutral-500">Machines (estimate):</span> {audit.machinesCount}</div>}
          {audit.preferredTime && <div><span className="text-neutral-500">Preferred time:</span> {audit.preferredTime}</div>}
          {audit.notes && <div><span className="text-neutral-500">Notes:</span> {audit.notes}</div>}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <select className={inputClass()} value={draft.status} onChange={(e) => setD({ status: e.target.value as AuditDraft["status"] })}>
              {AUDIT_STATUSES.map((s) => <option className="bg-neutral-900 text-white" key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Scheduled for">
            <input type="date" className={inputClass()} value={draft.scheduledFor} onChange={(e) => setD({ scheduledFor: e.target.value })} />
          </Field>
          <Field label="Audit fee ($)">
            <input type="number" min="0" className={inputClass()} value={draft.auditFee} onChange={(e) => setD({ auditFee: e.target.value })} />
          </Field>
          <Field label="Per machine ($)">
            <input type="number" min="0" className={inputClass()} value={draft.perMachineFee} onChange={(e) => setD({ perMachineFee: e.target.value })} />
          </Field>
        </div>
        <div className="text-sm text-neutral-300 mb-4">
          Total charge: <span className="text-orange-400 font-bold">{money(total)}</span>
          <span className="text-neutral-500"> ({money(Number(draft.auditFee || 0))}{Number(draft.perMachineFee || 0) > 0 ? ` + ${money(Number(draft.perMachineFee))} × ${machineCount} machine${machineCount === 1 ? "" : "s"}` : ""})</span>
        </div>
        <Field label="Overall findings for the customer" hint="Shown at the top of their report.">
          <textarea rows={3} className={inputClass()} value={draft.summary} onChange={(e) => setD({ summary: e.target.value })} placeholder="e.g. Machines generally in good order; two hoses on the KX040 boom need replacing before the next big job." />
        </Field>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => save(draft)} disabled={saving || !dirty}
            className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg"
          >
            {saving ? "Saving…" : "Save details"}
          </button>
          {audit.status !== "completed" && (
            <button
              onClick={() => save({ ...draft, status: "completed" })} disabled={saving || !items || items.length === 0}
              title={items?.length === 0 ? "Add the hoses you audited first" : undefined}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black font-bold px-4 py-2 rounded-lg"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark audit complete
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-lg">
          Hoses audited{items ? ` (${items.length})` : ""}
          {replaceCount > 0 && <span className="text-orange-400 text-sm font-semibold"> · {replaceCount} to replace</span>}
        </h3>
      </div>

      {items === null && !error && <p className="text-neutral-500">Loading…</p>}

      <div className="space-y-3">
        {editing === "new" ? (
          <AuditItemForm
            title="Add audited hose" initial={emptyAuditItem(newLabel)} machineLabels={labels} userId={userId}
            onCancel={() => setEditing(null)}
            onSave={async (d) => {
              const created = await createAuditItem(audit.id, d);
              setItems((is) => sortItems([...(is || []), created]));
              setNewLabel(d.machineLabel);
              setEditing(null);
            }}
          />
        ) : (
          items !== null && (
            <button onClick={() => setEditing("new")} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg">
              <Plus className="w-4 h-4" /> Add hose
            </button>
          )
        )}

        {items?.length === 0 && editing !== "new" && (
          <div className="text-center py-10 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
            Record each hose you inspect: which machine, where it is, its condition, a photo, and what you recommend.
          </div>
        )}

        {labels.map((label) => (
          <div key={label}>
            <div className="text-neutral-400 text-xs font-bold uppercase tracking-wide mt-4 mb-2">{label}</div>
            <div className="space-y-2">
              {(items || []).filter((i) => i.machineLabel === label).map((i) => (
                <Fragment key={i.id}>
                  {editing === i.id ? (
                    <AuditItemForm
                      title={`Edit ${i.position}`} initial={i} machineLabels={labels} userId={userId}
                      onCancel={() => setEditing(null)}
                      onSave={async (d) => {
                        const saved = await updateAuditItem(i.id, d);
                        setItems((is) => sortItems((is || []).map((x) => (x.id === i.id ? saved : x))));
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-white font-semibold">{i.position}</span>
                          <Badge tone={conditionInfo(i.condition).tone}>{conditionInfo(i.condition).label}</Badge>
                        </div>
                        <div className="text-sm text-orange-300 mt-0.5">{auditActionLabel(i.action)}{i.recommendation ? ` — ${i.recommendation}` : ""}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{describeHoseSpec(i.spec)}</div>
                        {i.photos.length > 0 && <div className="mt-2"><PhotoStrip photos={i.photos} size="w-16 h-16" alt="Audit photo" /></div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditing(i.id)} title="Edit" aria-label="Edit" className="p-2 text-neutral-500 hover:text-white"><Pencil className="w-4 h-4" /></button>
                        <button
                          title="Delete" aria-label="Delete" className="p-2 text-neutral-500 hover:text-red-400"
                          onClick={async () => {
                            if (!window.confirm(`Remove ${i.position} from this audit?`)) return;
                            try {
                              await deleteAuditItem(i.id);
                              setItems((is) => (is || []).filter((x) => x.id !== i.id));
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Couldn't delete — please try again.");
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
