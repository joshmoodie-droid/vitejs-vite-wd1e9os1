// The supplier and admin portal view containers, extracted verbatim from
// App.tsx. Both are jobs/pricing (or jobs/suppliers) tab shells that render
// RequestCard / JobQuoteCard lists; AdminPortal also hosts AdminSuppliers.

import { useState } from "react";
import { LogOut, Wrench, Settings, Building2 } from "lucide-react";
import { RequestCard, JobQuoteCard } from "./portalCards";
import { PricingAdmin } from "./PricingAdmin";
import { AdminSuppliers } from "./AdminSuppliers";

export function SupplierPortal({ supplier, onLogout, requests, quotes, connections, pricing, onSavePricing, onSubmitManualQuote, onUnlock, onConfirmQuote, onRejectQuote, onUpdateFieldService, onMarkComplete }: any) {
  const [tab, setTab] = useState("jobs");
  const [jobType, setJobType] = useState("quotes"); // "quotes" = hose assembly, "field" = field service jobs
  const [stage, setStage] = useState("new");
  const myQuotes = quotes.filter((q) => q.supplierId === supplier.id);
  const matchingRequests = requests.filter((r) => r.selectedSupplierId === supplier.id);

  const isFieldJob = (r) => r.requestType === "booking";
  const requestsForType = matchingRequests.filter((r) => (jobType === "field" ? isFieldJob(r) : !isFieldJob(r)));
  const myQuotesForType = myQuotes.filter((q) => (jobType === "field" ? q.isBooking : !q.isBooking));

  const requestsNeedingAction = requestsForType.filter((r) => {
    const q = myQuotesForType.find((mq) => mq.requestId === r.id);
    return !q || (q.status === "pending" && q.quoteType === "auto");
  });
  const activeQuotes = myQuotesForType.filter((q) => q.status === "confirmed" || q.status === "accepted");
  const completedQuotes = myQuotesForType.filter((q) => q.status === "completed");

  const JOB_TYPES = [
    { key: "quotes", label: "Hose Assembly Quotes" },
    { key: "field", label: "Field Service Jobs" },
  ];

  const STAGES = [
    { key: "new", label: "New Requests", count: requestsNeedingAction.length },
    { key: "active", label: "Active", count: activeQuotes.length },
    { key: "completed", label: "Completed", count: completedQuotes.length },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{supplier.companyName}</h1>
          <p className="text-neutral-500 text-sm">{supplier.serviceArea ? supplier.serviceArea : "All areas"}</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-lg px-3 py-2">
          <LogOut className="w-3.5 h-3.5" /> Log out
        </button>
      </div>

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6">
        {[
          { key: "jobs", label: "Jobs", icon: Wrench },
          { key: "pricing", label: "Pricing", icon: Settings },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-2 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 ${tab === t.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        <div>
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-3">
            {JOB_TYPES.map((jt) => (
              <button key={jt.key} onClick={() => { setJobType(jt.key); setStage("new"); }}
                className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors ${jobType === jt.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
                {jt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-4">
            {STAGES.map((s) => (
              <button key={s.key} onClick={() => setStage(s.key)}
                className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors flex flex-col items-center gap-0.5 ${stage === s.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
                <span>{s.label}</span>
                <span className={stage === s.key ? "text-black/70" : "text-neutral-600"}>{s.count}</span>
              </button>
            ))}
          </div>

          {stage === "new" && (
            <div className="space-y-3">
              {requestsNeedingAction.length === 0 && (
                <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  No new requests in your service area right now.
                </div>
              )}
              {requestsNeedingAction.map((r) => {
                const q = myQuotesForType.find((mq) => mq.requestId === r.id) || null;
                return (
                  <RequestCard key={r.id} r={r} myQuote={q} pricing={pricing} onSubmitManualQuote={onSubmitManualQuote} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote} />
                );
              })}
            </div>
          )}

          {stage === "active" && (
            <div className="space-y-3">
              {activeQuotes.length === 0 && (
                <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  Nothing active right now.
                </div>
              )}
              {activeQuotes.map((q) => {
                const req = requests.find((r) => r.id === q.requestId);
                const conn = connections.find((c) => c.quoteId === q.id);
                return (
                  <JobQuoteCard
                    key={q.id} q={q} req={req} unlocked={conn?.unlocked}
                    pricing={pricing} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote}
                    onUpdateFieldService={onUpdateFieldService} onUnlock={onUnlock} onMarkComplete={onMarkComplete}
                  />
                );
              })}
            </div>
          )}

          {stage === "completed" && (
            <div className="space-y-3">
              {completedQuotes.length === 0 && (
                <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  No completed jobs yet.
                </div>
              )}
              {completedQuotes.map((q) => {
                const req = requests.find((r) => r.id === q.requestId);
                const conn = connections.find((c) => c.quoteId === q.id);
                return (
                  <JobQuoteCard
                    key={q.id} q={q} req={req} unlocked={conn?.unlocked}
                    pricing={pricing} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote}
                    onUpdateFieldService={onUpdateFieldService} onUnlock={onUnlock} onMarkComplete={onMarkComplete}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "pricing" && <PricingAdmin pricing={pricing} onSave={onSavePricing} />}
    </div>
  );
}

export function AdminPortal({
  onLogout, suppliers, pricingBySupplier, requests, quotes, connections,
  onSavePricing, onSubmitManualQuote, onUnlock, onConfirmQuote, onRejectQuote, onUpdateFieldService, onMarkComplete, onEditQuote,
  onAddSupplier, onUpdateSupplier, onDeleteSupplier,
}: any) {
  const [tab, setTab] = useState("jobs");
  const [jobType, setJobType] = useState("quotes");
  const [stage, setStage] = useState("new");

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.companyName || "Unknown supplier";
  const isFieldJob = (r) => r.requestType === "booking";

  const requestsForType = requests.filter((r) => (jobType === "field" ? isFieldJob(r) : !isFieldJob(r)));
  const quotesForType = quotes.filter((q) => (jobType === "field" ? q.isBooking : !q.isBooking));

  const requestsNeedingAction = requestsForType.filter((r) => {
    const q = quotesForType.find((mq) => mq.requestId === r.id);
    return !q || (q.status === "pending" && q.quoteType === "auto");
  });
  const activeQuotes = quotesForType.filter((q) => q.status === "confirmed" || q.status === "accepted");
  const completedQuotes = quotesForType.filter((q) => q.status === "completed");

  const JOB_TYPES = [
    { key: "quotes", label: "Hose Assembly Quotes" },
    { key: "field", label: "Field Service Jobs" },
  ];
  const STAGES = [
    { key: "new", label: "New Requests", count: requestsNeedingAction.length },
    { key: "active", label: "Active", count: activeQuotes.length },
    { key: "completed", label: "Completed", count: completedQuotes.length },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Admin</h1>
          <p className="text-neutral-500 text-sm">Full access across all suppliers.</p>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white border border-neutral-700 rounded-lg px-3 py-2">
          <LogOut className="w-3.5 h-3.5" /> Log out
        </button>
      </div>

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6">
        {[
          { key: "jobs", label: "Jobs", icon: Wrench },
          { key: "suppliers", label: "Suppliers", icon: Building2 },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-2 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-1.5 ${tab === t.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        <div>
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-3">
            {JOB_TYPES.map((jt) => (
              <button key={jt.key} onClick={() => { setJobType(jt.key); setStage("new"); }}
                className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors ${jobType === jt.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
                {jt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-4">
            {STAGES.map((s) => (
              <button key={s.key} onClick={() => setStage(s.key)}
                className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors flex flex-col items-center gap-0.5 ${stage === s.key ? "bg-orange-500 text-black" : "text-neutral-400"}`}>
                <span>{s.label}</span>
                <span className={stage === s.key ? "text-black/70" : "text-neutral-600"}>{s.count}</span>
              </button>
            ))}
          </div>

          {stage === "new" && (
            <div className="space-y-3">
              {requestsNeedingAction.length === 0 && (
                <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  No new requests right now.
                </div>
              )}
              {requestsNeedingAction.map((r) => {
                const q = quotesForType.find((mq) => mq.requestId === r.id) || null;
                return (
                  <div key={r.id}>
                    <div className="text-xs font-semibold text-neutral-500 mb-1.5 flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> {supplierName(r.selectedSupplierId)}
                    </div>
                    <RequestCard
                      r={r} myQuote={q} pricing={pricingBySupplier[r.selectedSupplierId]}
                      onSubmitManualQuote={(requestId, low, high, lead) => onSubmitManualQuote(requestId, r.selectedSupplierId, low, high, lead)}
                      onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {(stage === "active" || stage === "completed") && (
            <div className="space-y-3">
              {(stage === "active" ? activeQuotes : completedQuotes).length === 0 && (
                <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  {stage === "active" ? "Nothing active right now." : "No completed jobs yet."}
                </div>
              )}
              {(stage === "active" ? activeQuotes : completedQuotes).map((q) => {
                const req = requests.find((r) => r.id === q.requestId);
                const conn = connections.find((c) => c.quoteId === q.id);
                return (
                  <div key={q.id}>
                    <div className="text-xs font-semibold text-neutral-500 mb-1.5 flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" /> {supplierName(q.supplierId)}
                    </div>
                    <JobQuoteCard
                      q={q} req={req} unlocked={conn?.unlocked}
                      pricing={pricingBySupplier[q.supplierId]} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote}
                      onUpdateFieldService={onUpdateFieldService} onUnlock={onUnlock} onMarkComplete={onMarkComplete}
                      onEditQuote={onEditQuote}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "suppliers" && (
        <AdminSuppliers
          suppliers={suppliers} pricingBySupplier={pricingBySupplier}
          onSavePricing={onSavePricing} onAddSupplier={onAddSupplier}
          onUpdateSupplier={onUpdateSupplier} onDeleteSupplier={onDeleteSupplier}
        />
      )}
    </div>
  );
}
