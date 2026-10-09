// The signed-in customer's "My requests" dashboard. Loads the customer's own
// requests from Supabase and links each to its /r/:id status page. Quote
// requests can be re-ordered, and accepted jobs not yet in the maintenance
// register can be saved to a machine. MY_REQ_STATUS is used only here.

import { useState, useEffect } from "react";
import { Plus, RotateCcw, Tractor } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Badge } from "./ui";
import { SaveToMachine } from "./machines/SaveToMachine";
import { CustomerAudits } from "./audits/CustomerAudits";
import { assembliesFromRequest, listSavedRequestIds, type QuotePrefill } from "../lib/machines";

const MY_REQ_STATUS = {
  open: { label: "Awaiting quote", tone: "neutral" },
  accepted: { label: "Accepted", tone: "orange" },
};

export function MyRequests({ customerId, email, onNew, onOrderAgain, onMachines }: any) {
  const [rows, setRows] = useState(null);
  // request ids whose hoses are already in the register (linked at request
  // time, or saved here)
  const [inRegister, setInRegister] = useState(new Set());
  const [savingId, setSavingId] = useState(null);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    supabase
      .from("requests")
      .select("id, request_type, status, location, created_at, access_token, assemblies, machine_id, selected_supplier_id, fulfillment, delivery_address")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data || []));
    // Only drives whether "Save to a machine" is offered — fail quiet.
    listSavedRequestIds().then(setInRegister).catch(() => {});
  }, [customerId]);

  const orderAgain = (r) => {
    const prefill: QuotePrefill = {
      assemblies: assembliesFromRequest(r.assemblies),
      machineId: r.machine_id || "",
      location: r.location || "",
      selectedSupplierId: r.selected_supplier_id || "",
      fulfillment: r.fulfillment || "pickup",
      deliveryAddress: r.delivery_address || "",
    };
    onOrderAgain(prefill);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">My requests</h1>
          <p className="text-neutral-500 text-sm">{email}</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New request
        </button>
      </div>

      <CustomerAudits customerId={customerId} />

      {rows === null && <p className="text-neutral-500">Loading…</p>}

      {savedMessage && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {savedMessage}
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          Nothing here yet. Requests you submit while signed in — or any past
          requests that used <span className="text-neutral-300">{email}</span> —
          will appear here.
        </div>
      )}

      <div className="space-y-3">
        {(rows || []).map((r) => {
          const meta = MY_REQ_STATUS[r.status] || { label: r.status, tone: "neutral" };
          const isQuote = r.request_type !== "booking";
          const registered = !!r.machine_id || inRegister.has(r.id);
          const canSave = isQuote && r.status === "accepted" && !registered && (r.assemblies || []).length > 0;
          return (
            <div key={r.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <a href={`/r/${encodeURIComponent(r.id)}?t=${r.access_token}`} className="block group">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-orange-500 text-sm group-hover:underline">{r.id}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <div className="text-sm text-neutral-400">
                  {isQuote ? "Hose quote request" : "Field service booking"}
                  {r.location ? ` · ${r.location}` : ""}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ""}
                </div>
              </a>

              {(isQuote || registered) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                  {isQuote && (
                    <button onClick={() => orderAgain(r)} className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 text-sm font-semibold">
                      <RotateCcw className="w-3.5 h-3.5" /> Order again
                    </button>
                  )}
                  {canSave && savingId !== r.id && (
                    <button onClick={() => { setSavingId(r.id); setSavedMessage(""); }} className="flex items-center gap-1.5 text-neutral-300 hover:text-white text-sm font-semibold">
                      <Tractor className="w-3.5 h-3.5" /> Save to a machine
                    </button>
                  )}
                  {registered && (
                    <span className="flex items-center gap-1.5 text-neutral-500 text-xs">
                      <Tractor className="w-3.5 h-3.5" /> In your maintenance register
                    </span>
                  )}
                </div>
              )}

              {savingId === r.id && (
                <SaveToMachine
                  requestId={r.id}
                  assemblies={r.assemblies || []}
                  supplierId={r.selected_supplier_id || null}
                  onCancel={() => setSavingId(null)}
                  onAddMachine={onMachines}
                  onSaved={(machineName) => {
                    setInRegister((s) => new Set(s).add(r.id));
                    setSavingId(null);
                    setSavedMessage(`Saved ${r.id} to ${machineName}. Find it under My machines.`);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
