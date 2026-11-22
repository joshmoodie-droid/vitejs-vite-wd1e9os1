// "Ask a supplier" enquiries: a customer describes what they need (text plus up
// to 3 photos per message) and a supplier replies with a way forward.
// The tables are read-only to the browser; every write goes through the
// SECURITY DEFINER functions in supabase/migrations/0023_enquiries.sql, which
// also decide which supplier receives the enquiry.

import { supabase } from "../supabaseClient";

export type InquiryStatus = "open" | "replied" | "quote_sent" | "closed";

export interface Inquiry {
  id: string;
  subject: string;
  status: InquiryStatus;
  location: string;
  machineId: string | null;
  supplierName: string;
  createdAt: string;
  lastMessageAt: string;
  customerReadAt: string | null;
}

export interface InquiryMessage {
  id: string;
  sender: "customer" | "supplier";
  body: string;
  photos: string[];
  createdAt: string;
}

export const INQUIRY_STATUS: Record<InquiryStatus, { label: string; tone: string }> = {
  open: { label: "Waiting for a reply", tone: "neutral" },
  replied: { label: "Supplier replied", tone: "orange" },
  quote_sent: { label: "Quote sent", tone: "green" },
  closed: { label: "Closed", tone: "neutral" },
};

// A reply the customer hasn't opened yet. Posting a message or opening the
// thread stamps customer_read_at to the same instant as last_message_at.
export function isUnread(i: Inquiry): boolean {
  return i.status !== "closed" && (!i.customerReadAt || i.customerReadAt < i.lastMessageAt);
}

type Row = Record<string, any>;

function inquiryFromRow(r: Row): Inquiry {
  return {
    id: r.id,
    subject: r.subject,
    status: r.status,
    location: r.location ?? "",
    machineId: r.machine_id ?? null,
    supplierName: r.suppliers?.company_name ?? "Supplier",
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    customerReadAt: r.customer_read_at ?? null,
  };
}

function messageFromRow(r: Row): InquiryMessage {
  return {
    id: r.id,
    sender: r.sender,
    body: r.body,
    photos: Array.isArray(r.photos) ? r.photos.filter((p: unknown): p is string => typeof p === "string") : [],
    createdAt: r.created_at,
  };
}

// An admin can read every enquiry, so always filter to the signed-in customer's own.
export async function listMyInquiries(customerId: string): Promise<Inquiry[]> {
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, subject, status, location, machine_id, created_at, last_message_at, customer_read_at, suppliers(company_name)")
    .eq("customer_id", customerId)
    .order("last_message_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(inquiryFromRow);
}

export async function listMessages(inquiryId: string): Promise<InquiryMessage[]> {
  const { data, error } = await supabase
    .from("inquiry_messages")
    .select("id, sender, body, photos, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(messageFromRow);
}

export async function createInquiry(input: {
  subject: string;
  body: string;
  location: string;
  machineId: string;
  photos: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_inquiry", {
    p_subject: input.subject,
    p_body: input.body,
    p_location: input.location,
    p_machine_id: input.machineId || null,
    p_photos: input.photos,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Your enquiry wasn't saved — please try again.");
  return data as string;
}

export async function postCustomerMessage(inquiryId: string, body: string, photos: string[]): Promise<void> {
  const { data, error } = await supabase.rpc("post_inquiry_message", {
    p_inquiry_id: inquiryId,
    p_as: "customer",
    p_body: body,
    p_photos: photos,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Your message wasn't saved — please try again.");
}

export async function markInquiryRead(inquiryId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_inquiry_read", { p_inquiry_id: inquiryId, p_as: "customer" });
  if (error) throw new Error(error.message);
}

export async function closeInquiry(inquiryId: string): Promise<void> {
  const { error } = await supabase.rpc("close_inquiry", { p_inquiry_id: inquiryId, p_as: "customer" });
  if (error) throw new Error(error.message);
}
