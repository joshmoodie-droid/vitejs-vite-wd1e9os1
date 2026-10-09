// Customer-facing hose audit report, opened from the emailed link
// /a/:auditId?t=:token. No sign-in needed: the audit-report Edge Function
// checks the token and returns the report with signed photo URLs.

import { useEffect, useState } from "react";
import { ClipboardCheck, Phone, Mail } from "lucide-react";
import { Badge } from "../ui";
import { conditionInfo } from "../../lib/checks";
import { describeHoseSpec, emptyHoseSpec } from "../../lib/machines";
import { fetchAuditReport, auditActionLabel, auditStatusInfo, money, type AuditReport as Report } from "../../lib/audits";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

// Most urgent first.
const ACTION_ORDER: Record<string, number> = { replace_now: 0, replace_next_service: 1, monitor: 2, none: 3 };
const actionTone: Record<string, string> = { replace_now: "red", replace_next_service: "orange", monitor: "amber", none: "green" };

export default function AuditReport({ auditId, token }: { auditId: string; token: string | null }) {
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "notfound" | "error" | "ok">("loading");

  useEffect(() => {
    if (!token || !UUID_RE.test(token) || !UUID_RE.test(auditId)) { setState("notfound"); return; }
    let cancelled = false;
    fetchAuditReport(auditId, token)
      .then((r) => { if (!cancelled) { setReport(r); setState("ok"); } })
      .catch((e) => { if (!cancelled) setState(/not found/i.test(String(e?.message)) ? "notfound" : "error"); });
    return () => { cancelled = true; };
  }, [auditId, token]);

  const card = "border border-neutral-800 bg-neutral-900 rounded-xl p-5";
  const items = report ? [...report.items].sort((a, b) => (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9)) : [];
  const machines = [...new Set(items.map((i) => i.machineLabel))];
  const toReplace = items.filter((i) => i.action === "replace_now" || i.action === "replace_next_service").length;

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white font-sans px-5 py-10" style={{ colorScheme: "dark" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center text-orange-500 font-bold">H</div>
          <span className="font-extrabold">HoseQuote</span>
        </div>

        {state === "loading" && <p className="text-neutral-500">Loading your report…</p>}

        {(state === "notfound" || state === "error") && (
          <div className={card}>
            <h1 className="text-xl font-bold mb-1">{state === "notfound" ? "Report not found" : "Couldn't load the report"}</h1>
            <p className="text-neutral-400 text-sm">
              {state === "notfound" ? "This link may be incorrect. Ask your supplier to send it again." : "Please try again in a moment."}
            </p>
            <a href="/" className="inline-block mt-4 bg-orange-500 hover:bg-orange-600 text-black font-bold px-5 py-2.5 rounded-lg">Go to HoseQuote</a>
          </div>
        )}

        {state === "ok" && report && (
          <>
            <div className="mb-6">
              <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-1 flex items-center gap-2">
                <ClipboardCheck className="w-3.5 h-3.5" /> Hose audit report
              </div>
              <h1 className="text-2xl font-extrabold">{report.audit.customerName}</h1>
              <p className="text-neutral-400 text-sm mt-1">
                {[report.audit.siteAddress || report.audit.location, day(report.audit.completedAt || report.audit.scheduledFor)].filter(Boolean).join(" · ")}
              </p>
              {report.audit.status !== "completed" && (
                <div className="mt-2"><Badge tone={auditStatusInfo(report.audit.status).tone}>{auditStatusInfo(report.audit.status).label}</Badge></div>
              )}
            </div>

            <div className={`${card} mb-4`}>
              <div className="grid grid-cols-3 gap-3 text-center mb-4">
                <div><div className="text-2xl font-extrabold">{items.length}</div><div className="text-xs text-neutral-500">hoses checked</div></div>
                <div><div className="text-2xl font-extrabold">{machines.length}</div><div className="text-xs text-neutral-500">machine{machines.length === 1 ? "" : "s"}</div></div>
                <div><div className={`text-2xl font-extrabold ${toReplace ? "text-orange-400" : "text-emerald-400"}`}>{toReplace}</div><div className="text-xs text-neutral-500">to replace</div></div>
              </div>
              {report.audit.summary && <p className="text-neutral-200 whitespace-pre-wrap">{report.audit.summary}</p>}
            </div>

            {report.supplier && (
              <div className={`${card} mb-6 text-sm`}>
                <div className="text-neutral-500 mb-1">Audited by</div>
                <div className="font-semibold text-white">{report.supplier.name}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-neutral-300">
                  {report.supplier.phone && <a href={`tel:${report.supplier.phone}`} className="flex items-center gap-1.5 hover:text-white"><Phone className="w-3.5 h-3.5" />{report.supplier.phone}</a>}
                  {report.supplier.email && <a href={`mailto:${report.supplier.email}`} className="flex items-center gap-1.5 hover:text-white"><Mail className="w-3.5 h-3.5" />{report.supplier.email}</a>}
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-800 text-neutral-300">
                  Audit fee <span className="text-orange-400 font-bold">{money(report.audit.total)}</span>
                  <span className="text-neutral-500"> — payable to {report.supplier.name}</span>
                </div>
              </div>
            )}

            {machines.map((m) => (
              <div key={m} className="mb-6">
                <h2 className="text-neutral-400 text-xs font-bold uppercase tracking-wide mb-2">{m}</h2>
                <div className="space-y-3">
                  {items.filter((i) => i.machineLabel === m).map((i) => {
                    const c = conditionInfo(i.condition);
                    return (
                      <div key={i.id} className={card}>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold">{i.position}</span>
                          <Badge tone={c.tone}>{c.label}</Badge>
                        </div>
                        <div className="text-sm">
                          <Badge tone={actionTone[i.action] ?? "neutral"}>{auditActionLabel(i.action)}</Badge>
                          {i.recommendation && <span className="text-neutral-300 ml-2">{i.recommendation}</span>}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1.5">{describeHoseSpec({ ...emptyHoseSpec(), ...i.spec })}</div>
                        {i.photos.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {i.photos.map((url, n) => (
                              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`${i.position} photo ${n + 1}`} className="w-28 h-28 object-cover rounded-md border border-neutral-700 hover:border-orange-500" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <a href="/machines" className="inline-block mt-2 text-sm text-neutral-500 hover:text-white">
              Have a HoseQuote account? This audit is in your maintenance register →
            </a>
          </>
        )}
      </div>
    </div>
  );
}
