// The "Enquiries" side of My requests: the customer's enquiries, newest
// activity first, each opening as a message thread. The list is loaded by the
// parent (My requests) so the tab can show a "new reply" dot.

import { MessageCircleQuestion, ChevronRight } from "lucide-react";
import { Badge } from "../ui";
import { EnquiryThread, type NextSteps } from "./EnquiryThread";
import { INQUIRY_STATUS, isUnread, type Inquiry } from "../../lib/inquiries";

export function MyEnquiries({
  customerId, inquiries, loadError, openId, onOpen, onReload, onAsk, nextSteps,
}: {
  customerId: string;
  inquiries: Inquiry[] | null;
  loadError: string;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onReload: () => void;
  onAsk: () => void;
  nextSteps: NextSteps;
}) {
  const open = inquiries?.find((i) => i.id === openId);

  if (open) {
    return <EnquiryThread inquiry={open} userId={customerId} role="customer" onBack={() => onOpen(null)} onChanged={onReload} nextSteps={nextSteps} />;
  }

  return (
    <div>
      {loadError && <p className="text-red-400 text-sm mb-4">Couldn't load your enquiries: {loadError}</p>}
      {inquiries === null && !loadError && <p className="text-neutral-500">Loading…</p>}

      {inquiries?.length === 0 && (
        <div className="text-center py-12 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          <MessageCircleQuestion className="w-8 h-8 mx-auto mb-3 text-neutral-600" />
          <p className="mb-4">Not sure what you need? Describe it, add photos, and a supplier will recommend a fix.</p>
          <button onClick={onAsk} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-5 py-2.5 rounded-lg transition-colors">
            Ask a supplier
          </button>
        </div>
      )}

      <div className="space-y-3">
        {inquiries?.map((i) => {
          const meta = INQUIRY_STATUS[i.status];
          const unread = isUnread(i, "customer");
          return (
            <button
              key={i.id}
              onClick={() => onOpen(i.id)}
              className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-5 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {unread && <span aria-label="New reply" className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
                  <span className="text-white font-semibold break-words">{i.subject}</span>
                </div>
                <div className="text-sm text-neutral-400">
                  {i.supplierName}{i.location ? ` · ${i.location}` : ""} · {new Date(i.lastMessageAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={unread ? "orange" : meta.tone}>{unread ? "New reply" : meta.label}</Badge>
                <ChevronRight className="w-5 h-5 text-neutral-600" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
