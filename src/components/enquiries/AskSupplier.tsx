// "Ask a supplier": the signed-in customer describes what they need, attaches
// photos and optionally a machine, and the enquiry goes to the supplier taking
// enquiries (chosen server-side). Sign-in is enforced by the caller (App.tsx)
// and, underneath, by the create_inquiry function.

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircleQuestion } from "lucide-react";
import { Field, inputClass } from "../ui";
import { PhotoUploader } from "../photos/PhotoUploader";
import { listMachines, type Machine } from "../../lib/machines";
import { createInquiry } from "../../lib/inquiries";

export function AskSupplier({
  userId, onBack, onSent,
}: {
  userId: string;
  onBack: () => void;
  onSent: (inquiryId: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState("");
  const [machineId, setMachineId] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // A failed load just hides the machine picker — the form must keep working.
  useEffect(() => {
    let cancelled = false;
    listMachines().then((m) => { if (!cancelled) setMachines(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const send = async () => {
    const e: { subject?: string; body?: string } = {};
    if (!subject.trim()) e.subject = "Give your enquiry a short title.";
    if (!body.trim()) e.body = "Describe what you need or what's going wrong.";
    setErrors(e);
    setSendError("");
    if (e.subject || e.body) return;
    setSending(true);
    try {
      const id = await createInquiry({ subject: subject.trim(), body: body.trim(), location: location.trim(), machineId, photos });
      onSent(id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Your enquiry couldn't be sent — please try again.");
      setSending(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div className="mb-8">
        <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-3">
          <MessageCircleQuestion className="w-6 h-6 text-orange-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Ask a supplier</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Not sure what you need? Describe it, add photos, and a supplier will recommend a fix.
          Your email and phone stay private.
        </p>
      </div>

      <Field label="What's it about?" required error={errors.subject}>
        <input
          className={inputClass(errors.subject)} value={subject} maxLength={120}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Hose keeps splitting on my excavator boom"
        />
      </Field>

      <Field
        label="Tell us what's happening" required error={errors.body}
        hint="The machine, what's failing, what you've tried — as much as you know."
      >
        <textarea
          className={inputClass(errors.body)} rows={5} value={body} maxLength={4000}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>

      <Field label="Photos">
        <PhotoUploader userId={userId} value={photos} onChange={setPhotos} hint="Photos of the hose, fittings or the leak help a lot. Up to 3." />
      </Field>

      {machines.length > 0 && (
        <Field label="Which machine is this about?" hint="Optional.">
          <select className={inputClass()} value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option className="bg-neutral-900 text-white" value="">Not a specific machine</option>
            {machines.map((m) => (
              <option className="bg-neutral-900 text-white" key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Where are you?" hint="Suburb or postcode — optional, but it helps a supplier plan a visit.">
        <input className={inputClass()} value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} />
      </Field>

      {sendError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {sendError}
        </div>
      )}

      <button
        type="button" onClick={send} disabled={sending}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold py-3 rounded-lg transition-colors"
      >
        {sending ? "Sending…" : "Send enquiry"}
      </button>
    </div>
  );
}
