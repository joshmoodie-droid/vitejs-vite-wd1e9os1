import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Read-only view reached from email links: /r/:requestId?t=:accessToken
// Shows the current state of a request + its quotes without needing a login.
// Accepting a quote still happens in the main app (and will move behind
// customer auth in Phase 2).

type Screen = "loading" | "notfound" | "ok";

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting supplier confirmation",
  confirmed: "Quote ready to accept",
  accepted: "Accepted",
  declined: "Not selected",
  rejected: "Declined by supplier",
  completed: "Job complete",
};

export default function RequestStatus({
  requestId,
  token,
}: {
  requestId: string;
  token: string | null;
}) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [request, setRequest] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // The token is the security boundary — request ids are guessable, so
      // never resolve a request without a valid one.
      const isUuid =
        !!token &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          token,
        );
      if (!isUuid) {
        setScreen("notfound");
        return;
      }
      const { data: reqRows } = await supabase
        .from("requests")
        .select("*")
        .eq("id", requestId)
        .eq("access_token", token as string)
        .limit(1);
      const req = reqRows?.[0];
      if (!req) {
        setScreen("notfound");
        return;
      }

      const { data: quoteRows } = await supabase
        .from("quotes")
        .select("*")
        .eq("request_id", requestId)
        .neq("status", "declined")
        .order("created_at", { ascending: false });

      const accepted = (quoteRows || []).find(
        (x: any) => x.status === "accepted" || x.status === "completed",
      );
      if (accepted?.supplier_id) {
        const { data: sup } = await supabase
          .from("suppliers")
          .select("company_name, contact_email, contact_phone")
          .eq("id", accepted.supplier_id)
          .single();
        setSupplier(sup);
      }

      setRequest(req);
      setQuotes(quoteRows || []);
      setScreen("ok");
    })();
  }, [requestId, token]);

  const card =
    "border border-neutral-800 bg-neutral-900 rounded-xl p-5";

  return (
    <div
      className="min-h-screen bg-[#0B0B0C] text-white font-sans px-5 py-10"
      style={{ colorScheme: "dark" }}
    >
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center text-orange-500 font-bold">
            H
          </div>
          <span className="font-extrabold">HoseQuote</span>
        </div>

        {screen === "loading" && (
          <p className="text-neutral-500">Loading your request…</p>
        )}

        {screen === "notfound" && (
          <div className={card}>
            <h1 className="text-xl font-bold mb-1">Request not found</h1>
            <p className="text-neutral-400 text-sm">
              This link may be incorrect or expired. Open the app to start a new
              request.
            </p>
            <a
              href="/"
              className="inline-block mt-4 bg-orange-500 hover:bg-orange-600 text-black font-bold px-5 py-2.5 rounded-lg"
            >
              Go to HoseQuote
            </a>
          </div>
        )}

        {screen === "ok" && request && (
          <>
            <div className="mb-6">
              <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-1">
                {request.request_type === "booking"
                  ? "Field service booking"
                  : "Hose quote request"}
              </div>
              <h1 className="text-2xl font-extrabold">
                Reference{" "}
                <span className="font-mono text-orange-500">{request.id}</span>
              </h1>
              <p className="text-neutral-400 text-sm mt-1">
                {request.location ? `${request.location} · ` : ""}
                submitted{" "}
                {request.created_at
                  ? new Date(request.created_at).toLocaleDateString()
                  : ""}
              </p>
            </div>

            {quotes.length === 0 && (
              <div className={card}>
                <p className="text-neutral-400 text-sm">
                  No quote yet. You'll get an email as soon as a supplier
                  responds.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {quotes.map((q) => {
                const confirmed = ["confirmed", "accepted", "completed"].includes(
                  q.status,
                );
                const isAccepted =
                  q.status === "accepted" || q.status === "completed";
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl p-5 border ${
                      isAccepted
                        ? "border-orange-500 bg-orange-500/5"
                        : "border-neutral-800 bg-neutral-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-neutral-300">
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </div>
                    <div className="text-2xl font-extrabold text-orange-500">
                      ${q.price_low}
                      {q.price_high != null && q.price_high !== q.price_low
                        ? ` – $${q.price_high}`
                        : ""}
                    </div>
                    {q.lead_time_days != null && (
                      <div className="text-sm text-neutral-500 mt-1">
                        ~{q.lead_time_days} day
                        {q.lead_time_days !== 1 ? "s" : ""} lead time
                      </div>
                    )}

                    {isAccepted && supplier && (
                      <div className="mt-3 pt-3 border-t border-neutral-700 text-sm">
                        <div className="font-semibold">
                          {supplier.company_name}
                        </div>
                        <div className="text-neutral-400">
                          {[supplier.contact_phone, supplier.contact_email]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    )}

                    {q.status === "confirmed" && (
                      <a
                        href="/"
                        className="mt-4 block text-center bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg"
                      >
                        Open the app to accept
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <a
              href="/"
              className="inline-block mt-8 text-sm text-neutral-500 hover:text-white"
            >
              ← Back to HoseQuote
            </a>
          </>
        )}
      </div>
    </div>
  );
}
