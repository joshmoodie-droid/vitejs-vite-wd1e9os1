// RLS regression test.
//
// Verifies the Phase 3c security boundary still holds for an anonymous caller
// holding only the public publishable key — i.e. that a future migration or a
// dashboard edit hasn't quietly reopened a `USING (true)` hole.
//
// Contract (see supabase/migrations/0006_phase3c_rls_lockdown.sql):
//   - requests / quotes / connections  -> invisible to anon (SELECT returns [])
//   - machines / machine_hoses / service_log / hose_checks -> no anon access (0012, 0015)
//   - audits / audit_items -> no anon access; anon can't call book_audit (0016)
//     or create_quote_from_audit (0019)
//   - suppliers / supplier_pricing     -> still world-readable (customer picker)
//   - every table                      -> anon cannot INSERT / UPDATE
//   - the sanctioned anon path (SECURITY DEFINER RPCs) still callable
//   - create_request rejects a machine_id the caller doesn't own (0013)
//   - the `photos` storage bucket: no anon upload, no public reads (0014)
//
// Run: `npm run test:rls`. Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// (from the environment, or a local .env). Read-only apart from writes that RLS
// is expected to reject; if one unexpectedly lands, the script deletes the test
// row and fails. Exits non-zero on any breach.

import { readFileSync } from "node:fs";

// --- config -------------------------------------------------------------------
for (const k of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  if (process.env[k]) continue;
  try {
    const hit = readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(k + "="));
    if (hit) process.env[k] = hit.slice(k.length + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env — rely on the environment */
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (set them in the env or a local .env).",
  );
  process.exit(2);
}

const REST = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
const authHeaders = { apikey: KEY, authorization: `Bearer ${KEY}` };
const api = (path, init = {}) =>
  fetch(`${REST}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers || {}) },
  });

// --- tiny harness -----------------------------------------------------------
let failures = 0;
const pass = (name, detail = "") =>
  console.log(`  ok   ${name}${detail ? `  (${detail})` : ""}`);
const fail = (name, detail) => {
  console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ""}`);
  failures++;
};
const check = (name, ok, detail) => (ok ? pass(name, ok === true ? "" : ok) : fail(name, detail));

console.log(`RLS regression test → ${SUPABASE_URL}\n`);

// --- 1. tables that must be invisible to an anonymous caller ----------------
// A regression that re-adds `USING (true)` shows up as rows coming back here.
// (Assumes prod holds at least one row in each; an empty table would pass
// vacuously. requests/quotes certainly have historical rows.)
for (const table of ["requests", "quotes", "connections"]) {
  const res = await api(`/${table}?select=id&limit=5`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const locked = res.status === 200 && Array.isArray(body) && body.length === 0;
  check(
    `anon cannot read ${table}`,
    locked,
    `expected 200 [] — got ${res.status}, ${
      Array.isArray(body) ? `${body.length} row(s)` : JSON.stringify(body)?.slice(0, 120)
    }`,
  );
}

// --- 1b. customer-only tables (maintenance register, migration 0012) --------
// anon has no grants on these at all, so PostgREST answers 401/403
// (permission denied) rather than 200 []. Either means no rows leaked. These
// tables may be empty, so the INSERT probes in section 3 are the real guard.
for (const table of ["machines", "machine_hoses", "service_log", "hose_checks", "audits", "audit_items"]) {
  const res = await api(`/${table}?select=id&limit=5`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const locked =
    res.status === 401 ||
    res.status === 403 ||
    (res.status === 200 && Array.isArray(body) && body.length === 0);
  check(
    `anon cannot read ${table}`,
    locked,
    `expected 401/403 or 200 [] — got ${res.status}, ${
      Array.isArray(body) ? `${body.length} row(s)` : JSON.stringify(body)?.slice(0, 120)
    }`,
  );
}

// --- 2. tables that must stay world-readable -------------------------------
// The customer supplier-picker runs unauthenticated; over-locking these breaks
// the app just as surely as under-locking the others leaks data.
for (const table of ["suppliers", "supplier_pricing"]) {
  const res = await api(`/${table}?select=*&limit=5`);
  let rowCount = null;
  try {
    const body = await res.json();
    rowCount = Array.isArray(body) ? body.length : null;
  } catch {
    /* non-JSON */
  }
  const readable = res.status === 200 && rowCount >= 1;
  check(
    `anon can still read ${table}`,
    readable,
    `expected 200 with >=1 row — got status ${res.status}, ${rowCount ?? "non-array"} row(s)`,
  );
}

// grab a real supplier for the no-op write probes below
let realSupplier = null;
{
  const res = await api(`/suppliers?select=id,company_name&limit=1`);
  try {
    [realSupplier] = await res.json();
  } catch {
    /* handled by the check above */
  }
}

// --- 3. anon must not be able to INSERT anywhere -------------------------
// Any non-2xx means "no row was written" (RLS/grant rejection, or a NOT NULL /
// FK constraint) — all acceptable. Only a 2xx is a breach; if one happens the
// row is deleted with the same anon key and the check fails loudly.
const NONE = "RLS-REGRESSION-none";
const marker = `RLS-REGRESSION-${Date.now()}`;
const inserts = [
  ["requests", { id: marker, customer_id: null }],
  ["quotes", { id: marker, request_id: NONE, supplier_id: realSupplier?.id ?? NONE }],
  ["connections", { quote_id: NONE }],
  ["suppliers", { company_name: `${marker} (delete me)` }],
  ["supplier_pricing", { supplier_id: realSupplier?.id ?? NONE }],
  ["machines", { name: `${marker} (delete me)` }],
  ["machine_hoses", { machine_id: "00000000-0000-0000-0000-000000000000", position: marker }],
  ["service_log", { machine_id: "00000000-0000-0000-0000-000000000000" }],
  ["hose_checks", { machine_id: "00000000-0000-0000-0000-000000000000", condition: "ok" }],
  ["audits", { supplier_id: realSupplier?.id ?? NONE, source: "supplier", customer_name: `${marker} (delete me)` }],
  ["audit_items", { audit_id: "00000000-0000-0000-0000-000000000000", machine_label: marker, position: marker, condition: "ok" }],
];
for (const [table, row] of inserts) {
  const res = await api(`/${table}`, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    pass(`anon cannot insert ${table}`, `rejected ${res.status}`);
    continue;
  }
  let created = [];
  try {
    created = await res.json();
  } catch {
    /* representation not returned */
  }
  const id = created?.[0]?.id;
  let cleanup = "no id returned to clean up";
  if (id != null) {
    const del = await api(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    cleanup = del.ok
      ? "test row deleted"
      : `COULD NOT DELETE — remove ${table} id=${id} manually (${del.status})`;
  }
  fail(`anon cannot insert ${table}`, `INSERT SUCCEEDED (${res.status}); ${cleanup}`);
}

// --- 4. anon must not be able to UPDATE ---------------------------------
// No-op PATCH (writes each column back its current value) against a real row.
// RLS-blocked -> PostgREST reports 0 rows affected ([]); a regression that lets
// it through returns the row. The value is unchanged either way.
if (realSupplier) {
  const res = await api(`/suppliers?id=eq.${realSupplier.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ company_name: realSupplier.company_name }),
  });
  let rows = null;
  try {
    rows = await res.json();
  } catch {
    /* non-JSON */
  }
  const blocked = !res.ok || (Array.isArray(rows) && rows.length === 0);
  check(
    "anon cannot update suppliers",
    blocked,
    `PATCH affected ${Array.isArray(rows) ? rows.length : "?"} row(s) — status ${res.status}`,
  );
  // suppliers_delete shares the exact is_admin() predicate as suppliers_update,
  // so the probe above covers write-lock; DELETE isn't tested on its own
  // because there's no way to do it against a real row non-destructively.
} else {
  fail("anon cannot update suppliers", "no supplier row available to probe");
}

// --- 5. the sanctioned anonymous path still works ---------------------
// The /r/:id link flow calls get_request_by_token as anon. A revoked grant or a
// dropped function would 401/404 here and silently break every quote email.
{
  const res = await api(`/rpc/get_request_by_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_request_id: NONE,
      p_token: "00000000-0000-0000-0000-000000000000",
    }),
  });
  check(
    "anon can still call get_request_by_token RPC",
    res.status === 200,
    `expected 200 (no-match is fine) — got ${res.status}`,
  );
}

// --- 6. create_request refuses a machine the caller doesn't own (0013) -------
// anon owns no machines, so any machine_id must be rejected. If the guard ever
// regresses this writes one junk request row (staging only) and fails loudly.
{
  const res = await api(`/rpc/create_request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      r: {
        id: `${marker}-machine`,
        request_type: "quote",
        status: "open",
        fulfillment: "pickup",
        machine_id: "00000000-0000-0000-0000-000000000000",
      },
    }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  check(
    "anon cannot link a request to a machine",
    !res.ok && /another customer's machine/.test(body?.message ?? ""),
    `expected the ownership error — got ${res.status}, ${JSON.stringify(body)?.slice(0, 160)}`,
  );
}

// --- 7. request photos bucket is private (0014) -----------------------------
// anon may not upload, and nothing in `photos` is served publicly.
{
  const STORAGE = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
  const path = `rls-check/${marker}.jpg`;
  const up = await fetch(`${STORAGE}/object/photos/${path}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "image/jpeg" },
    body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  if (up.ok) {
    const del = await fetch(`${STORAGE}/object/photos/${path}`, { method: "DELETE", headers: authHeaders });
    fail(
      "anon cannot upload to photos",
      `UPLOAD SUCCEEDED (${up.status}); ${del.ok ? "test object deleted" : `COULD NOT DELETE photos/${path}`}`,
    );
  } else {
    pass("anon cannot upload to photos", `rejected ${up.status}`);
  }

  const pub = await fetch(`${STORAGE}/object/public/photos/${path}`);
  check(
    "photos bucket is not public",
    !pub.ok,
    `public URL answered ${pub.status} — the bucket must stay private`,
  );
}

// --- 8. hose audits can't be booked anonymously (0016) ----------------------
{
  const res = await api(`/rpc/book_audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_supplier_id: realSupplier?.id ?? "00000000-0000-0000-0000-000000000000",
      p_location: marker, p_site_address: marker, p_machines_count: 1,
      p_preferred_time: "", p_phone: "", p_notes: marker,
    }),
  });
  check("anon cannot book a hose audit", !res.ok, `book_audit answered ${res.status} for anon`);
}

// --- 9. quotes can't be made from an audit anonymously (0019) ---------------
{
  const res = await api(`/rpc/create_quote_from_audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_audit_id: "00000000-0000-0000-0000-000000000000", p_item_ids: [],
      p_on_site: false, p_hoses_price: 1, p_lead_time_days: 1,
    }),
  });
  check("anon cannot create a quote from an audit", !res.ok, `create_quote_from_audit answered ${res.status} for anon`);
}

// --- verdict --------------------------------------------------------------
console.log("");
if (failures) {
  console.error(`${failures} check(s) FAILED — the RLS boundary has regressed.`);
  process.exit(1);
}
console.log("All RLS checks passed.");
