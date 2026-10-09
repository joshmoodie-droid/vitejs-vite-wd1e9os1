// The signed-in customer's hose audits, shown on My requests, with a link to
// the full report (photos, recommendations) once the audit is complete.

import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "../ui";
import { listAudits, auditStatusInfo, auditTotal, money, auditReportPath, type Audit } from "../../lib/audits";

export function CustomerAudits({ customerId }: { customerId: string }) {
  const [audits, setAudits] = useState<Audit[]>([]);

  useEffect(() => {
    let cancelled = false;
    // RLS returns the customer's own audits (and nothing else) — fail quiet.
    listAudits()
      .then((a) => { if (!cancelled) setAudits(a); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customerId]);

  if (audits.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-orange-500" /> Hose audits
      </h2>
      <div className="space-y-3">
        {audits.map((a) => {
          const s = auditStatusInfo(a.status);
          return (
            <div key={a.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-semibold">{a.siteAddress || a.location || "Hose audit"}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <div className="text-sm text-neutral-400">
                {[
                  a.scheduledFor && `Scheduled ${new Date(`${a.scheduledFor}T00:00:00`).toLocaleDateString("en-AU")}`,
                  `${money(auditTotal(a))} payable to the supplier`,
                ].filter(Boolean).join(" · ")}
              </div>
              {a.status === "completed" && a.summary && <p className="text-sm text-neutral-300 mt-2">{a.summary}</p>}
              {a.status === "completed" && (
                <a href={auditReportPath(a)} className="inline-block mt-3 text-orange-400 hover:text-orange-300 text-sm font-semibold">
                  View report — photos and recommendations →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
