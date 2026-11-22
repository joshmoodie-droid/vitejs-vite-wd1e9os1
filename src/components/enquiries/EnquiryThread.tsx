// One enquiry as a message thread: the customer's messages and the supplier's
// replies, a reply box, and a close button. Used by both sides — `role` says
// which one is looking. Not live chat: Refresh (or reopening the page) fetches
// new messages.

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Wrench, Truck, ClipboardCheck } from "lucide-react";
import { Badge, inputClass } from "../ui";
import { PhotoStrip } from "../photos/PhotoStrip";
import { PhotoUploader } from "../photos/PhotoUploader";
import {
  INQUIRY_STATUS, isUnread, listMessages, markInquiryRead, postMessage, closeInquiry,
  type Inquiry, type InquiryMessage, type InquiryRole,
} from "../../lib/inquiries";

// Where an enquiry can lead. The customer's side opens the existing forms with
// what they already told the supplier filled in; nothing is created until they
// submit that form as usual.
export interface NextSteps {
  quote: (prefill: { location: string; machineId: string; notes: string }) => void;
  booking: (prefill: { location: string; description: string; notes: string }) => void;
  audit: () => void;
}

// Suggestions a supplier can drop into the reply box (and edit before sending).
// They point at the buttons the customer sees under the thread.
const SUGGESTIONS = [
  { label: "Suggest a hose quote", text: "Thanks for the details. I'd suggest getting a hose quote so we can price the right assemblies for you. Tap \"Get a hose quote\" below and your details will be filled in." },
  { label: "Suggest an on-site visit", text: "From what you've described, it sounds best for a technician to look at it on site. Tap \"Book a field service job\" below to arrange a time." },
  { label: "Suggest a hose audit", text: "It would be worth checking the other hoses on the machine while we're at it. Tap \"Book a hose audit\" below and we'll go through them." },
];

export function EnquiryThread({
  inquiry, userId, role, onBack, onChanged, nextSteps,
}: {
  inquiry: Inquiry;
  userId: string;
  role: InquiryRole;
  onBack: () => void;
  onChanged: () => void; // the list should reload (status / unread changed)
  nextSteps?: NextSteps; // customer side only
}) {
  const [messages, setMessages] = useState<InquiryMessage[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setMessages(await listMessages(inquiry.id));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [inquiry.id]);

  useEffect(() => { load(); }, [load]);

  // Opening the thread reads it. Best effort — a failure here only means the
  // "new" marker lingers.
  useEffect(() => {
    if (!isUnread(inquiry, role)) return;
    markInquiryRead(inquiry.id, role).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry.id]);

  const closed = inquiry.status === "closed";
  const meta = INQUIRY_STATUS[inquiry.status];
  const otherName = role === "customer" ? inquiry.supplierName : inquiry.customerName;
  const firstCustomerBody = messages?.find((m) => m.sender === "customer")?.body ?? "";
  const supplierHasReplied = !!messages?.some((m) => m.sender === "supplier");
  const note = `Re my enquiry: ${inquiry.subject}`;

  const send = async () => {
    if (!reply.trim()) { setActionError("Write a message first."); return; }
    setActionError("");
    setSending(true);
    try {
      await postMessage(inquiry.id, role, reply.trim(), photos);
      setReply("");
      setPhotos([]);
      await load();
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Your message couldn't be sent — please try again.");
    }
    setSending(false);
  };

  const close = async () => {
    setActionError("");
    try {
      await closeInquiry(inquiry.id, role);
      setConfirmClose(false);
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't close this enquiry — please try again.");
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Enquiries
      </button>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-extrabold text-white break-words min-w-0">{inquiry.subject}</h1>
        <span className="shrink-0"><Badge tone={meta.tone}>{meta.label}</Badge></span>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {role === "customer" ? "To" : "From"} {otherName}
        {inquiry.location ? ` · ${inquiry.location}` : ""} · {new Date(inquiry.createdAt).toLocaleDateString()}
        <button onClick={load} className="ml-3 inline-flex items-center gap-1 text-orange-500 hover:text-orange-400 font-semibold">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </p>

      {loadError && <p className="text-red-400 text-sm mb-4">Couldn't load the messages: {loadError}</p>}
      {messages === null && !loadError && <p className="text-neutral-500">Loading…</p>}

      <div className="space-y-3 mb-6">
        {messages?.map((m) => {
          const mine = m.sender === role;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-3 border ${mine ? "bg-orange-500/10 border-orange-500/30" : "bg-neutral-900 border-neutral-800"}`}>
                <div className="text-xs font-semibold mb-1 text-neutral-400">
                  {mine ? "You" : otherName}
                  <span className="font-normal text-neutral-600"> · {new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-white text-sm whitespace-pre-wrap break-words">{m.body}</p>
                {m.photos.length > 0 && <div className="mt-3"><PhotoStrip photos={m.photos} /></div>}
              </div>
            </div>
          );
        })}
      </div>

      {role === "customer" && nextSteps && !closed && supplierHasReplied && (
        <div className="mb-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="text-white font-bold mb-1">Ready for the next step?</div>
          <p className="text-neutral-400 text-sm mb-3">These open the usual forms with what you've told the supplier filled in. Nothing is sent until you submit.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => nextSteps.quote({ location: inquiry.location, machineId: inquiry.machineId ?? "", notes: note })}
              className="flex-1 flex items-center justify-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-bold px-4 py-2.5 rounded-lg text-sm transition-colors">
              <Wrench className="w-4 h-4" /> Get a hose quote
            </button>
            <button type="button" onClick={() => nextSteps.booking({ location: inquiry.location, description: firstCustomerBody.slice(0, 500), notes: note })}
              className="flex-1 flex items-center justify-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-bold px-4 py-2.5 rounded-lg text-sm transition-colors">
              <Truck className="w-4 h-4" /> Book a field service job
            </button>
            <button type="button" onClick={() => nextSteps.audit()}
              className="flex-1 flex items-center justify-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-bold px-4 py-2.5 rounded-lg text-sm transition-colors">
              <ClipboardCheck className="w-4 h-4" /> Book a hose audit
            </button>
          </div>
        </div>
      )}

      {closed ? (
        <p className="text-center text-sm text-neutral-500 border border-dashed border-neutral-800 rounded-xl py-6">
          {role === "customer"
            ? "This enquiry is closed. You can start a new one any time from the home screen."
            : "This enquiry is closed."}
        </p>
      ) : (
        <div>
          {role === "supplier" && (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} type="button" onClick={() => setReply(s.text)}
                  className="text-xs font-semibold text-neutral-300 hover:text-white border border-neutral-700 hover:border-orange-500 rounded-full px-3 py-1.5 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            className={inputClass()} rows={3} value={reply} maxLength={4000}
            onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…"
          />
          <div className="mt-3">
            <PhotoUploader userId={userId} value={photos} onChange={setPhotos} hint="Add photos (up to 3)." />
          </div>

          {actionError && (
            <div role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {actionError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-4">
            <button
              type="button" onClick={send} disabled={sending}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            {confirmClose ? (
              <span className="text-sm text-neutral-400">
                Close this enquiry?{" "}
                <button onClick={close} className="text-orange-400 hover:text-orange-300 font-semibold">Yes, close it</button>{" · "}
                <button onClick={() => setConfirmClose(false)} className="text-neutral-300 hover:text-white font-semibold">Keep open</button>
              </span>
            ) : (
              <button onClick={() => setConfirmClose(true)} className="text-sm text-neutral-400 hover:text-white font-semibold">
                {role === "customer" ? "Mark as resolved" : "Close enquiry"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
