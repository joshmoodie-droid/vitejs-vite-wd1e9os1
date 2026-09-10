// The signed-in customer's "My requests" dashboard. Extracted verbatim from
// App.tsx. Loads the customer's own requests from Supabase and links each to
// its /r/:id status page. MY_REQ_STATUS is used only here.

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Badge } from "./ui";

const MY_REQ_STATUS = {
  open: { label: "Awaiting quote", tone: "neutral" },
  accepted: { label: "Accepted", tone: "orange" },
};

export function MyRequests({ customerId, email, onNew }: any) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    supabase
      .from("requests")
      .select("id, request_type, status, location, created_at, access_token")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, [customerId]);

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

      {rows === null && <p className="text-neutral-500">Loading…</p>}

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
          return (
            <a
              key={r.id}
              href={`/r/${encodeURIComponent(r.id)}?t=${r.access_token}`}
              className="block bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-orange-500 text-sm">{r.id}</span>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <div className="text-sm text-neutral-400">
                {r.request_type === "booking" ? "Field service booking" : "Hose quote request"}
                {r.location ? ` · ${r.location}` : ""}
                {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ""}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
