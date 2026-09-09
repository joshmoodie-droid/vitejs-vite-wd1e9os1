// Supabase Edge Function: notify
// -------------------------------------------------------------------
// Fired by Database Webhooks on the `requests` and `quotes` tables.
// Diffs the row change, decides which transactional emails to send,
// and sends them through Resend. Every email carries a link back to
// the app.
//
// Deploy:   supabase functions deploy notify   (or paste into the Dashboard
//           → Edge Functions → Via Editor and click Deploy)
// Secrets:  RESEND_API_KEY, APP_URL, EMAIL_FROM  — set in Dashboard →
//           Edge Functions → Secrets (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//           are injected automatically). SENTRY_DSN is optional — set it to send
//           handler crashes and Resend failures to Sentry; leave it unset and
//           this is a no-op.
// -------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as Sentry from "npm:@sentry/deno@10.74.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "HoseQuote <onboarding@resend.dev>";

// Error monitoring. No-op unless SENTRY_DSN is set (local `supabase functions
// serve` and any project without the secret stay quiet). The DSN is a
// write-only ingest key.
const SENTRY_DSN = Deno.env.get("SENTRY_DSN") ?? "";
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- email transport ----------

async function sendEmail(to: string | null | undefined, subject: string, html: string) {
  if (!to) return;
  if (!RESEND_API_KEY) {
    console.log(`[notify] RESEND_API_KEY not set — would have emailed ${to}: ${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[notify] Resend error ${res.status}: ${body}`);
    Sentry.captureMessage(`Resend send failed (${res.status})`, {
      level: "error",
      extra: {
        status: res.status,
        // response body only — no recipient address (customer PII)
        body: body.slice(0, 500),
        subject,
        toDomain: to.includes("@") ? to.split("@")[1] : "(none)",
      },
    });
  }
}

// ---------- templates ----------

const shell = (heading: string, body: string, cta?: { label: string; url: string }) => `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 12px">${heading}</h2>
    <div style="font-size:15px;line-height:1.6">${body}</div>
    ${cta ? `<p style="margin:24px 0">
      <a href="${cta.url}" style="background:#f97316;color:#000;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${cta.label}</a>
    </p>` : ""}
    <p style="font-size:12px;color:#888;margin-top:28px">HoseQuote — hydraulic hose service</p>
  </div>`;

const money = (lo: number, hi: number) => `$${lo}${hi != null && hi !== lo ? ` – $${hi}` : ""}`;

function customerLink(req: any) {
  return `${APP_URL}/r/${encodeURIComponent(req.id)}?t=${req.access_token}`;
}
const supplierLink = () => `${APP_URL}/supplier`;

// ---------- lookups ----------

async function getRequest(id: string) {
  const { data } = await admin.from("requests").select("*").eq("id", id).single();
  return data;
}
async function getSupplier(id: string | null) {
  if (!id) return null;
  const { data } = await admin.from("suppliers").select("*").eq("id", id).single();
  return data;
}

// ---------- event handlers ----------

async function onRequestCreated(req: any) {
  const supplier = await getSupplier(req.selected_supplier_id);
  const kind = req.request_type === "booking" ? "field service booking" : "hose quote request";

  await sendEmail(
    req.email,
    `We've received your ${kind}`,
    shell(
      `Thanks, ${req.name || "there"} — your request is in`,
      `Your reference is <b>${req.id}</b>. ${supplier ? `It's been sent to a supplier` : "We're matching you to a supplier"}.
       You'll get an email as soon as there's a quote to review.`,
      { label: "Track this request", url: customerLink(req) },
    ),
  );

  await sendEmail(
    supplier?.contact_email,
    `New ${kind} — ${req.id}`,
    shell(
      `New ${kind}`,
      `A customer (${req.name || "—"}) submitted <b>${req.id}</b> in ${req.location || "an unspecified area"}.
       Open the supplier portal to price it up.`,
      { label: "Open supplier portal", url: supplierLink() },
    ),
  );
}

async function onQuoteStatusChange(quote: any, oldStatus: string) {
  const req = await getRequest(quote.request_id);
  if (!req) return;
  const supplier = await getSupplier(quote.supplier_id);

  switch (quote.status) {
    case "confirmed": {
      await sendEmail(
        req.email,
        `Your quote is ready — ${req.id}`,
        shell(
          "A supplier has confirmed your quote",
          `Estimated total: <b>${money(quote.price_low, quote.price_high)}</b>, about ${quote.lead_time_days} day(s) lead time.
           Review it and accept when you're ready.`,
          { label: "View & accept quote", url: customerLink(req) },
        ),
      );
      break;
    }
    case "rejected": {
      await sendEmail(
        req.email,
        `Update on your request — ${req.id}`,
        shell(
          "This supplier can't take the job",
          `Unfortunately the supplier declined request <b>${req.id}</b>. You can submit a new request and pick a different supplier.`,
          { label: "Start a new request", url: `${APP_URL}/` },
        ),
      );
      break;
    }
    case "accepted": {
      await sendEmail(
        req.email,
        `Booking confirmed — ${req.id}`,
        shell(
          "You're booked in",
          `You accepted ${supplier?.company_name ? `<b>${supplier.company_name}</b>'s` : "the"} quote for <b>${req.id}</b>.
           ${supplier?.contact_phone || supplier?.contact_email
             ? `Supplier contact: ${[supplier.contact_phone, supplier.contact_email].filter(Boolean).join(" · ")}`
             : "The supplier will be in touch."}`,
          { label: "View booking", url: customerLink(req) },
        ),
      );
      await sendEmail(
        supplier?.contact_email,
        `Quote accepted — ${req.id}`,
        shell(
          "Your quote was accepted",
          `${req.name || "A customer"} accepted your quote for <b>${req.id}</b>.
           Contact: ${[req.phone, req.email].filter(Boolean).join(" · ") || "see portal"}.`,
          { label: "Open supplier portal", url: supplierLink() },
        ),
      );
      break;
    }
    case "completed": {
      await sendEmail(
        req.email,
        `Job complete — ${req.id}`,
        shell(
          "Your job is marked complete",
          `${supplier?.company_name ? `<b>${supplier.company_name}</b> has` : "The supplier has"} marked <b>${req.id}</b> complete. Thanks for using HoseQuote.`,
          { label: "View summary", url: customerLink(req) },
        ),
      );
      break;
    }
    default:
      console.log(`[notify] quote ${quote.id} ${oldStatus} -> ${quote.status} (no email)`);
  }
}

// ---------- webhook entrypoint ----------

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const { type, table, record, old_record } = payload;
  try {
    if (table === "requests" && type === "INSERT") {
      await onRequestCreated(record);
    } else if (table === "quotes" && type === "UPDATE" && record?.status !== old_record?.status) {
      await onQuoteStatusChange(record, old_record?.status);
    }
  } catch (e) {
    console.error("[notify] handler error", e);
    // 200 anyway so Supabase doesn't hammer retries; errors are in the logs.
    Sentry.captureException(e, {
      tags: { table, type },
      // ids like HQ-xxx / quote ids — not PII
      extra: { record_id: record?.id, request_id: record?.request_id },
    });
  } finally {
    // the runtime can freeze the isolate right after we respond, so make sure
    // anything queued actually leaves first
    if (SENTRY_DSN) await Sentry.flush(2000);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
