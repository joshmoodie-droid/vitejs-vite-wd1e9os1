// The supplier / admin "Enquiries" tab: enquiries customers have sent, newest
// activity first, each opening as a message thread to reply to. A supplier sees
// their own (row-level security); an admin sees every one and answers as
// HoseQuote. Customers appear by display name only — contact details stay
// private until a job is accepted.

import { useState } from "react";
import { MessageCircleQuestion, ChevronRight } from "lucide-react";
import { Badge } from "../ui";
import { EnquiryThread } from "./EnquiryThread";
import { INQUIRY_STATUS, isUnread, type Inquiry } from "../../lib/inquiries";

export function SupplierEnquiries({
  userId, inquiries, loadError, onReload, showSupplier = false, initialOpenId = null,
}: {
  userId: string;
  inquiries: Inquiry[] | null;
  loadError: string;
  onReload: () => void;
  showSupplier?: boolean; // admin: show which supplier each enquiry went to
  initialOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const open = inquiries?.find((i) => i.id === openId);

  if (open) {
    return <EnquiryThread inquiry={open} userId={userId} role="supplier" onBack={() => setOpenId(null)} onChanged={onReload} />;
  }

  return (
    <div>
      {loadError && <p className="text-red-400 text-sm mb-4">Couldn't load enquiries: {loadError}</p>}
      {inquiries === null && !loadError && <p className="text-neutral-500">Loading…</p>}

      {inquiries?.length === 0 && (
        <div className="text-center py-12 px-6 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          <MessageCircleQuestion className="w-8 h-8 mx-auto mb-3 text-neutral-600" />
          No enquiries yet. When a customer asks for help choosing a fix, it shows up here.
        </div>
      )}

      <div className="space-y-3">
        {inquiries?.map((i) => {
          const meta = INQUIRY_STATUS[i.status];
          const unread = isUnread(i, "supplier");
          return (
            <button
              key={i.id}
              onClick={() => setOpenId(i.id)}
              className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-5 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {unread && <span aria-label="New message" className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
                  <span className="text-white font-semibold break-words">{i.subject}</span>
                </div>
                <div className="text-sm text-neutral-400">
                  {i.customerName}{i.location ? ` · ${i.location}` : ""} · {new Date(i.lastMessageAt).toLocaleDateString()}
                  {showSupplier ? ` · to ${i.supplierName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge tone={unread ? "orange" : meta.tone}>{unread ? "New" : meta.label}</Badge>
                <ChevronRight className="w-5 h-5 text-neutral-600" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
