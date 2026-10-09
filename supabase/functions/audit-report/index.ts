// Supabase Edge Function: audit-report
// -------------------------------------------------------------------
// Called from the app (not a webhook). Two actions:
//
//   { action: "view", id, token }
//     The customer's hose audit report, for the /a/:id?t=token page. No
//     sign-in: the audit's access_token is the key. Photos live in the
//     private `photos` bucket, so they come back as short-lived signed URLs
//     made here with the service role.
//
//   { action: "send", id }   + Authorization: Bearer <user access token>
//     Emails the customer their report link. Only the audit's supplier or an
//     admin may send it. Stamps audits.report_sent_at.
//
// Deploy:   supabase functions deploy audit-report   (verify_jwt = false in
//           config.toml — "view" is anonymous; "send" checks the caller's
//           token itself). Or Dashboard → Edge Functions → Deploy a new
//           function → Via Editor, name it `audit-report`, paste, Deploy,
//           then turn OFF "Enforce JWT verification".
// Secrets:  RESEND_API_KEY, APP_URL, EMAIL_FROM — the same project secrets
//           the notify function uses (SUPABASE_URL / SERVICE_ROLE_KEY are
//           injected automatically).
// -------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "HoseQuote <onboarding@resend.dev>";
const PHOTO_URL_TTL = 60 * 60 * 24; // a day: long enough to read the report, short enough to expire

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Anything typed by a person goes through esc() before it lands in email HTML.
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const reportLink = (a: { id: string; access_token: string }) => `${APP_URL}/a/${a.id}?t=${a.access_token}`;

function total(a: any, items: any[]) {
  const machines = new Set(items.map((i) => String(i.machine_label).trim().toLowerCase())).size
    || Number(a.machines_count || 0);
  return Number(a.audit_fee || 0) + Number(a.per_machine_fee || 0) * machines;
}

// ---------- view ----------

async function view(id: string, token: string) {
  if (!UUID_RE.test(id) || !UUID_RE.test(token)) return json({ error: "not found" }, 404);
  const { data: audit } = await admin.from("audits").select("*").eq("id", id).eq("access_token", token).maybeSingle();
  if (!audit) return json({ error: "not found" }, 404);

  const [{ data: supplier }, { data: items }] = await Promise.all([
    admin.from("suppliers").select("company_name, contact_email, contact_phone").eq("id", audit.supplier_id).maybeSingle(),
    admin.from("audit_items").select("*").eq("audit_id", id).order("machine_label").order("created_at"),
  ]);
  const list = items ?? [];

  const paths = [...new Set(list.flatMap((i: any) => (Array.isArray(i.photos) ? i.photos : [])))] as string[];
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await admin.storage.from("photos").createSignedUrls(paths, PHOTO_URL_TTL);
    for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) signed[s.path] = s.signedUrl;
  }

  return json({
    audit: {
      id: audit.id,
      status: audit.status,
      customerName: audit.customer_name,
      siteAddress: audit.site_address,
      location: audit.location,
      scheduledFor: audit.scheduled_for,
      completedAt: audit.completed_at,
      summary: audit.summary,
      auditFee: Number(audit.audit_fee || 0),
      perMachineFee: Number(audit.per_machine_fee || 0),
      total: total(audit, list),
    },
    supplier: supplier
      ? { name: supplier.company_name, email: supplier.contact_email, phone: supplier.contact_phone }
      : null,
    items: list.map((i: any) => ({
      id: i.id,
      machineLabel: i.machine_label,
      position: i.position,
      condition: i.condition,
      action: i.action,
      recommendation: i.recommendation,
      spec: i.spec ?? {},
      photos: (Array.isArray(i.photos) ? i.photos : []).map((p: string) => signed[p]).filter(Boolean),
    })),
  });
}

// ---------- send ----------

async function send(id: string, authHeader: string | null) {
  const jwt = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return json({ error: "sign in required" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: "sign in required" }, 401);
  if (!UUID_RE.test(id)) return json({ error: "not found" }, 404);

  const { data: audit } = await admin.from("audits").select("*").eq("id", id).maybeSingle();
  if (!audit) return json({ error: "not found" }, 404);

  const [{ data: supplier }, { data: adminRow }] = await Promise.all([
    admin.from("suppliers").select("company_name, auth_user_id, contact_phone, contact_email").eq("id", audit.supplier_id).maybeSingle(),
    admin.from("app_admin_emails").select("email").ilike("email", user.email ?? "").maybeSingle(),
  ]);
  const allowed = supplier?.auth_user_id === user.id || !!adminRow;
  if (!allowed) return json({ error: "not allowed" }, 403);
  if (!audit.customer_email) return json({ error: "This audit has no customer email — copy the report link instead." }, 400);

  const { data: items } = await admin.from("audit_items").select("action, machine_label").eq("audit_id", id);
  const list = items ?? [];
  const replace = list.filter((i: any) => i.action === "replace_now" || i.action === "replace_next_service").length;
  const company = esc(supplier?.company_name ?? "Your supplier");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 12px">Your hose audit report</h2>
    <div style="font-size:15px;line-height:1.6">
      <p><b>${company}</b> has completed a hose audit${audit.site_address ? ` at ${esc(audit.site_address)}` : ""}:
      ${list.length} hose${list.length === 1 ? "" : "s"} checked${replace ? `, <b>${replace} recommended for replacement</b>` : ""}.</p>
      ${audit.summary ? `<p>${esc(audit.summary)}</p>` : ""}
      <p>The report has photos of each hose and what ${company} recommends. Audit fee: <b>$${total(audit, list).toFixed(2).replace(/\.00$/, "")}</b>, payable to ${company}.</p>
      ${audit.customer_id ? `<p>We've also added it to your maintenance register in HoseQuote.</p>` : ""}
    </div>
    <p style="margin:24px 0">
      <a href="${reportLink(audit)}" style="background:#f97316;color:#000;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">View your report</a>
    </p>
    <p style="font-size:12px;color:#888;margin-top:28px">HoseQuote — hydraulic hose service</p>
  </div>`;

  if (!RESEND_API_KEY) {
    console.log(`[audit-report] RESEND_API_KEY not set — would have emailed ${audit.customer_email}`);
  } else {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: audit.customer_email, subject: `Hose audit report — ${supplier?.company_name ?? "your supplier"}`, html }),
    });
    if (!res.ok) {
      console.error(`[audit-report] Resend error ${res.status}: ${await res.text()}`);
      return json({ error: "The email couldn't be sent — try again shortly." }, 502);
    }
  }

  await admin.from("audits").update({ report_sent_at: new Date().toISOString() }).eq("id", id);
  return json({ sent: true, to: audit.customer_email });
}

// ---------- entrypoint ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  try {
    if (body?.action === "view") return await view(String(body.id ?? ""), String(body.token ?? ""));
    if (body?.action === "send") return await send(String(body.id ?? ""), req.headers.get("Authorization"));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[audit-report] error", e);
    return json({ error: "Something went wrong — please try again." }, 500);
  }
});
