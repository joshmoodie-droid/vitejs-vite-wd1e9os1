import React, { useState, useEffect, useCallback } from "react";
import { Wrench, Gauge, Settings, Droplet, MapPin, User, ChevronLeft, ChevronRight, RefreshCw, Send, Lock, Unlock, LogOut, Building2, CheckCircle2, Plus, Clock, Truck, ClipboardList, ArrowLeft } from "lucide-react";
import { supabase } from "./supabaseClient";

const HOSE_TYPES = {
  hydraulic_oil: ["1-wire braid (SAE 100R1)", "2-wire braid (SAE 100R2)", "4-wire spiral (SAE 100R12)"],
  pressure_washer: ["2-wire braid (EN 853)", "Textile reinforced (low pressure)"],
};

const BORES = {
  hydraulic_oil: [
    { key: "1_4", label: '1/4" (6mm)' },
    { key: "3_8", label: '3/8" (10mm)' },
    { key: "1_2", label: '1/2" (13mm)' },
    { key: "5_8", label: '5/8" (16mm)' },
    { key: "3_4", label: '3/4" (19mm)' },
  ],
  pressure_washer: [
    { key: "1_4", label: '1/4" (6mm)' },
    { key: "3_8", label: '3/8" (10mm)' },
    { key: "1_2", label: '1/2" (13mm)' },
  ],
};

const FITTING_TYPES = ["BSP Male", "BSP Female", "JIC 37° Male", "JIC 37° Female", "ORFS Male", "ORFS Female", "NPT Male", "NPT Female", "SAE Flange"];
const ORIENTATIONS = ["Straight", "45° Bend", "90° Bend"];
const URGENCY = [
  { key: "standard", label: "Standard", desc: "Normal turnaround", mult: 1 },
  { key: "priority", label: "Priority", desc: "Fast-track service", mult: 1.3 },
  { key: "emergency", label: "Emergency", desc: "Urgent / after-hours", mult: 1.6 },
];

const EQUIPMENT_TYPES = ["Excavator", "Skid Steer / Loader", "Forklift", "Truck / Trailer", "Agricultural Equipment", "Pressure Washer", "Stationary Machinery", "Other"];
const JOB_ISSUES = ["Hose burst / failure", "Leak", "Fitting failure", "New installation", "Routine service / inspection", "Other"];

// Admin & supplier access is by Supabase Auth now (Phase 3a): admin = email in
// public.app_admin_emails; supplier = suppliers.auth_user_id linked to the
// signed-in user. See SupplierAuth.

function defaultPricing(scale = 1) {
  const hose = {};
  ["hydraulic_oil", "pressure_washer"].forEach((cat) => {
    BORES[cat].forEach((b, i) => {
      hose[`${cat}_${b.key}`] = {
        label: `${cat === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"} — ${b.label}`,
        price: Math.round((cat === "hydraulic_oil" ? 12 + i * 6 : 20 + i * 8) * scale),
        partNumber: "",
      };
    });
  });
  const fitting = {};
  const fittingPrices = { "BSP Male": 8, "BSP Female": 9, "JIC 37° Male": 12, "JIC 37° Female": 14, "ORFS Male": 15, "ORFS Female": 17, "NPT Male": 7, "NPT Female": 8, "SAE Flange": 25 };
  FITTING_TYPES.forEach((f) => (fitting[f] = { label: f, price: Math.round(fittingPrices[f] * scale), partNumber: "" }));
  return { hose, fitting, labourBase: Math.round(15 * scale), crimpCharge: Math.round(8 * scale), travelBase: Math.round(45 * scale), calloutFee: Math.round(65 * scale), labourHourlyRate: Math.round(85 * scale) };
}

function emptyAssembly() {
  return {
    id: `asm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: "hydraulic_oil", hoseType: "", bore: "", length: "", quantity: 1, pressure: "",
    fittingAType: "", fittingAOrientation: "Straight", fittingBType: "", fittingBOrientation: "Straight",
  };
}

function emptyForm() {
  return {
    assemblies: [emptyAssembly()],
    urgency: "standard", location: "", selectedSupplierId: "",
    fieldServiceRequested: false, siteAddress: "", accessNotes: "", fsLabourHoursEstimate: "",
    name: "", phone: "", email: "", preferredTime: "", notes: "", photoUrl: "",
  };
}

function calcEstimate(form, pricing) {
  if (!pricing) return null;
  let hoseCost = 0, fittingCost = 0, fittingCount = 0, validAssemblies = 0;
  const assemblyBreakdown = [];
  form.assemblies.forEach((a, idx) => {
    const boreKey = `${a.category}_${a.bore}`;
    const hoseRule = pricing.hose[boreKey];
    if (!hoseRule || !a.length) return;
    const length = parseFloat(a.length) || 0;
    const qty = parseInt(a.quantity) || 1;
    const fittingA = pricing.fitting[a.fittingAType];
    const fittingB = pricing.fitting[a.fittingBType];
    const aHoseCost = hoseRule.price * length * qty;
    const aFittingCost = ((fittingA ? fittingA.price : 0) + (fittingB ? fittingB.price : 0)) * qty;
    hoseCost += aHoseCost;
    fittingCost += aFittingCost;
    fittingCount += ((fittingA ? 1 : 0) + (fittingB ? 1 : 0)) * qty;
    validAssemblies += 1;
    assemblyBreakdown.push({
      index: idx, hoseType: a.hoseType, bore: a.bore, length, quantity: qty,
      hoseCost: aHoseCost, fittingCost: aFittingCost, subtotal: aHoseCost + aFittingCost,
    });
  });
  if (validAssemblies === 0) return null;
  const labour = pricing.labourBase * validAssemblies;
  const crimp = pricing.crimpCharge * fittingCount;
  const urgencyMult = URGENCY.find((u) => u.key === form.urgency)?.mult || 1;
  const travel = pricing.travelBase * urgencyMult;
  const callout = form.fieldServiceRequested ? (pricing.calloutFee ?? 65) : 0;
  const total = hoseCost + fittingCost + labour + crimp + travel;
  return {
    hoseCost, fittingCost, labour, crimp, travel, callout, total, assemblyCount: validAssemblies, assemblyBreakdown,
    low: Math.round(total * 0.92), high: Math.round(total * 1.08),
  };
}

function combinedTotal(quote) {
  const fs = quote.fieldService;
  if (!fs || !fs.requested) return { low: quote.priceLow, high: quote.priceHigh, hasOnSite: false };
  const extra = (parseFloat(fs.calloutFee) || 0) + (parseFloat(fs.travelCharge) || 0) + (parseFloat(fs.labour) || 0);
  return { low: quote.priceLow + extra, high: quote.priceHigh + extra, hasOnSite: true, extra };
}

function emptyBookingForm() {
  return {
    equipmentType: "", issue: "", description: "", labourHoursEstimate: "",
    urgency: "standard", location: "", selectedSupplierId: "",
    name: "", phone: "", email: "", preferredTime: "", notes: "", photoUrl: "",
  };
}

function calcBookingEstimate(form, pricing) {
  if (!pricing) return null;
  const calloutFee = pricing.calloutFee ?? 65;
  const urgencyMult = URGENCY.find((u) => u.key === form.urgency)?.mult || 1;
  const travelCharge = Math.round((pricing.travelBase ?? 45) * urgencyMult);
  const hourlyRate = pricing.labourHourlyRate ?? 85;
  const labourHours = form.labourHoursEstimate ? (parseFloat(form.labourHoursEstimate) || 0) : 1;
  const labour = Math.round(labourHours * hourlyRate);
  const total = calloutFee + travelCharge + labour;
  return {
    calloutFee, travelCharge, labour, labourHours, hourlyRate, total,
    low: Math.round(total * 0.95), high: Math.round(total * 1.05),
  };
}

function areasMatch(requestLocation, supplierArea) {
  const loc = (requestLocation || "").trim().toLowerCase();
  const area = (supplierArea || "").trim().toLowerCase();
  if (!area || area === "all" || area === "all areas") return true;
  if (!loc) return false;
  return loc.includes(area) || area.includes(loc);
}

function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `item_${Date.now()}`;
}

function Field({ label, required, error, children, hint }) {
  return (
    <div className="mb-5">
      <label className="block text-sm text-white mb-2">
        {label}{required && <span className="text-orange-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {!error && hint && <p className="text-xs text-neutral-500 mt-1.5">{hint}</p>}
    </div>
  );
}

const inputClass = (error) =>
  `w-full bg-neutral-900 border rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none transition-colors ${
    error ? "border-red-500" : "border-neutral-700 focus:border-orange-500"
  }`;

/* ---------- Supabase <-> app shape mapping ---------- */

function supplierFromRow(r) {
  return { id: r.id, companyName: r.company_name, passcode: r.passcode, serviceArea: r.service_area || "", contactEmail: r.contact_email, contactPhone: r.contact_phone, createdAt: r.created_at };
}
function pricingFromRow(r) {
  return { hose: r.hose || {}, fitting: r.fitting || {}, labourBase: r.labour_base, crimpCharge: r.crimp_charge, travelBase: r.travel_base, calloutFee: r.callout_fee, labourHourlyRate: r.labour_hourly_rate };
}
function requestFromRow(r) {
  return {
    id: r.id, requestType: r.request_type, status: r.status, selectedSupplierId: r.selected_supplier_id,
    accessToken: r.access_token,
    urgency: r.urgency, location: r.location, fieldServiceRequested: r.field_service_requested,
    siteAddress: r.site_address, accessNotes: r.access_notes, fsLabourHoursEstimate: r.fs_labour_hours_estimate,
    name: r.name, phone: r.phone, email: r.email, preferredTime: r.preferred_time, notes: r.notes, photoUrl: r.photo_url,
    assemblies: r.assemblies || [], equipmentType: r.equipment_type, issue: r.issue, description: r.description,
    labourHoursEstimate: r.labour_hours_estimate, createdAt: r.created_at,
  };
}
function quoteFromRow(r) {
  return {
    id: r.id, requestId: r.request_id, supplierId: r.supplier_id, isBooking: r.is_booking,
    priceLow: r.price_low, priceHigh: r.price_high, leadTimeDays: r.lead_time_days, quoteType: r.quote_type,
    status: r.status, calloutFee: r.callout_fee, travelCharge: r.travel_charge, labour: r.labour,
    hoseAssemblyCost: r.hose_assembly_cost, customerLabourHours: r.customer_labour_hours,
    fieldService: r.field_service, createdAt: r.created_at, completedAt: r.completed_at,
  };
}
function connectionFromRow(r) {
  return { id: r.id, quoteId: r.quote_id, unlocked: r.unlocked, unlockedAt: r.unlocked_at };
}

// The supplier email links to /supplier — open straight on that side.
const initialView =
  typeof window !== "undefined" && /^\/supplier\/?$/.test(window.location.pathname)
    ? "supplier"
    : "customer";

export default function HoseQuoteApp() {
  const [view, setView] = useState(initialView);
  const [flowType, setFlowType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [pricingBySupplier, setPricingBySupplier] = useState({});
  const [requests, setRequests] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // ---- customer accounts (Phase 2) ----
  const [customer, setCustomer] = useState(null); // Supabase auth user
  const [profile, setProfile] = useState(null);
  const [customerView, setCustomerView] = useState("new"); // "new" | "auth" | "mine"

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const [submittedRequestId, setSubmittedRequestId] = useState(null);

  const [bookingStep, setBookingStep] = useState(1);
  const [bookingForm, setBookingForm] = useState(emptyBookingForm());
  const [bookingErrors, setBookingErrors] = useState({});
  const [bookingSubmittedRequestId, setBookingSubmittedRequestId] = useState(null);

  useEffect(() => {
    document.documentElement.style.background = "#0B0B0C";
    document.body.style.background = "#0B0B0C";
    document.body.style.margin = "0";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
      document.body.style.margin = "";
    };
  }, []);

  const loadAll = useCallback(async (opts) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const { data: supRows } = await supabase.from("suppliers").select("*");
      const sup = (supRows || []).map(supplierFromRow);

      const { data: pricingRows } = await supabase.from("supplier_pricing").select("*");
      const pbs = {};
      (pricingRows || []).forEach((r) => { pbs[r.supplier_id] = pricingFromRow(r); });

      const { data: reqRows } = await supabase.from("requests").select("*").order("created_at", { ascending: false });
      const req = (reqRows || []).map(requestFromRow);

      const { data: quoteRows } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
      const qts = (quoteRows || []).map(quoteFromRow);

      const { data: connRows } = await supabase.from("connections").select("*");
      const conns = (connRows || []).map(connectionFromRow);

      setSuppliers(sup);
      setPricingBySupplier(pbs);
      setRequests(req);
      setQuotes(qts);
      setConnections(conns);
    } catch (e) {
      console.error("Failed to load data", e);
    }
    if (!opts?.quiet) setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Re-fetch once the auth user resolves. The mount loadAll() above runs before
  // the JWT is attached, so RLS-filtered tables (requests / quotes / connections)
  // come back empty for a signed-in supplier or admin until we ask again.
  useEffect(() => {
    if (customer) loadAll({ quiet: true });
  }, [customer, loadAll]);

  // ---- customer auth wiring (Phase 2) ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCustomer(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setCustomer(s?.user ?? null);
      if (evt === "SIGNED_IN") {
        // Supplier / admin sign-ins happen from the portal — leave them there;
        // the supplier-resolution effect routes them. Customers go to My requests.
        setView((v) => {
          if (v !== "supplier") {
            setFlowType(null);
            setCustomerView("mine");
          }
          return v;
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // load the signed-in customer's profile, and link any past anonymous
  // requests that used their (now verified) email address
  useEffect(() => {
    if (!customer) { setProfile(null); return; }
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", customer.id).single();
      if (!cancelled) setProfile(prof || { id: customer.id, email: customer.email });
      if (customer.email) {
        const { data: n } = await supabase.rpc("claim_my_requests");
        if (n) loadAll();
      }
    })();
    return () => { cancelled = true; };
  }, [customer, loadAll]);

  // resolve the signed-in account's supplier / admin context (Phase 3a).
  // Same auth user as the customer side — just interpreted for the portal.
  const [supplierResolved, setSupplierResolved] = useState(false);
  useEffect(() => {
    if (!customer) {
      setIsAdmin(false);
      setSession(null);
      setSupplierResolved(true);
      return;
    }
    let cancelled = false;
    setSupplierResolved(false);
    (async () => {
      const { data: admin } = await supabase.rpc("is_admin");
      if (cancelled) return;
      if (admin) {
        setIsAdmin(true);
        setSession(null);
        setSupplierResolved(true);
        return;
      }
      setIsAdmin(false);
      const { data: sid } = await supabase.rpc("claim_supplier");
      if (cancelled) return;
      setSession(sid || null);
      setSupplierResolved(true);
    })();
    return () => { cancelled = true; };
  }, [customer]);

  // prefill contact fields from the profile (only while still blank)
  useEffect(() => {
    if (!profile) return;
    const fill = (f) => ({
      ...f,
      name: f.name || profile.full_name || "",
      phone: f.phone || profile.phone || "",
      email: f.email || profile.email || "",
    });
    setForm(fill);
    setBookingForm(fill);
  }, [profile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCustomerView("new");
  };

  function pricingToRow(p) {
    return { hose: p.hose, fitting: p.fitting, labour_base: p.labourBase, crimp_charge: p.crimpCharge, travel_base: p.travelBase, callout_fee: p.calloutFee, labour_hourly_rate: p.labourHourlyRate };
  }

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const updateAssembly = (idx, key, value) => setForm((f) => ({
    ...f, assemblies: f.assemblies.map((a, i) => (i === idx ? { ...a, [key]: value } : a)),
  }));
  const addAssembly = () => setForm((f) => ({ ...f, assemblies: [...f.assemblies, emptyAssembly()] }));
  const removeAssembly = (idx) => setForm((f) => ({ ...f, assemblies: f.assemblies.filter((_, i) => i !== idx) }));

  const validateStep = (s) => {
    const e = {};
    if (s === 1) {
      form.assemblies.forEach((a, idx) => {
        if (!a.hoseType) e[`asm_${idx}_hoseType`] = "Please select a hose type.";
        if (!a.bore) e[`asm_${idx}_bore`] = "Please select the internal diameter.";
        if (!a.length || parseFloat(a.length) <= 0) e[`asm_${idx}_length`] = "Enter a length greater than 0.";
        if (!a.pressure) e[`asm_${idx}_pressure`] = "Enter the working pressure.";
        if (!a.fittingAType) e[`asm_${idx}_fittingAType`] = "Select a fitting type.";
        if (!a.fittingBType) e[`asm_${idx}_fittingBType`] = "Select a fitting type.";
      });
    }
    if (s === 2) {
      if (!form.location) e.location = "Enter a suburb or postcode.";
      if (!form.selectedSupplierId) e.selectedSupplierId = "Select a supplier to continue.";
      if (form.fieldServiceRequested && !form.siteAddress) e.siteAddress = "Enter the site address for the callout.";
    }
    if (s === 3) {
      if (!form.name) e.name = "Enter your full name.";
      if (!form.phone && !form.email) {
        e.phone = "Enter at least a phone number or email.";
        e.email = "Enter at least a phone number or email.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((s) => Math.min(3, s + 1)); };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!validateStep(3)) return;
    const id = `HQ-${Date.now()}`;
    const row = {
      id, request_type: "quote", status: "open", selected_supplier_id: form.selectedSupplierId,
      customer_id: customer?.id ?? null,
      urgency: form.urgency, location: form.location, field_service_requested: form.fieldServiceRequested,
      site_address: form.siteAddress, access_notes: form.accessNotes, fs_labour_hours_estimate: form.fsLabourHoursEstimate,
      name: form.name, phone: form.phone, email: form.email, preferred_time: form.preferredTime,
      notes: form.notes, photo_url: form.photoUrl, assemblies: form.assemblies,
    };
    const { data: inserted } = await supabase.from("requests").insert(row).select().single();
    const record = requestFromRow(inserted ?? { ...row, created_at: new Date().toISOString() });

    const pricing = pricingBySupplier[form.selectedSupplierId];
    const est = calcEstimate(form, pricing);
    let newQuoteRecord = null;
    if (est) {
      const quoteId = `Q-${Date.now()}-${form.selectedSupplierId}`;
      const fieldService = form.fieldServiceRequested ? {
        requested: true, status: "pending", siteAddress: form.siteAddress, accessNotes: form.accessNotes,
        calloutFee: pricing?.calloutFee ?? 65, travelCharge: pricing?.travelBase ?? 45,
        customerLabourHours: form.fsLabourHoursEstimate || null, labour: 0, labourHours: null, hourlyRate: null,
      } : null;
      const quoteRow = {
        id: quoteId, request_id: id, supplier_id: form.selectedSupplierId, is_booking: false,
        price_low: est.low, price_high: est.high,
        lead_time_days: form.urgency === "emergency" ? 1 : form.urgency === "priority" ? 2 : 4,
        quote_type: "auto", status: "pending", field_service: fieldService,
      };
      await supabase.rpc("create_auto_quote", { q: quoteRow });
      newQuoteRecord = quoteFromRow({ ...quoteRow, created_at: new Date().toISOString() });
    }

    setRequests((r) => [record, ...r]);
    if (newQuoteRecord) setQuotes((q) => [newQuoteRecord, ...q]);
    setSubmittedRequestId(id);
  };

  const resetWizard = () => { setForm(emptyForm()); setStep(1); setSubmittedRequestId(null); setErrors({}); setFlowType(null); };

  const confirmQuote = async (quoteId, overrides) => {
    const row = {};
    if (overrides.priceLow !== undefined) row.price_low = overrides.priceLow;
    if (overrides.priceHigh !== undefined) row.price_high = overrides.priceHigh;
    if (overrides.leadTimeDays !== undefined) row.lead_time_days = overrides.leadTimeDays;
    if (overrides.fieldService !== undefined) row.field_service = overrides.fieldService;
    if (overrides.calloutFee !== undefined) row.callout_fee = overrides.calloutFee;
    if (overrides.travelCharge !== undefined) row.travel_charge = overrides.travelCharge;
    if (overrides.labour !== undefined) row.labour = overrides.labour;
    row.status = "confirmed";
    await supabase.from("quotes").update(row).eq("id", quoteId);
    setQuotes((qs) => qs.map((q) => (q.id === quoteId ? { ...q, ...overrides, status: "confirmed" } : q)));
  };

  // Admin-only: adjust pricing on an already-active (confirmed/accepted) job without
  // touching its status — unlike confirmQuote, which is specifically the pending->confirmed step.
  const editQuote = async (quoteId, overrides) => {
    const row = {};
    if (overrides.priceLow !== undefined) row.price_low = overrides.priceLow;
    if (overrides.priceHigh !== undefined) row.price_high = overrides.priceHigh;
    if (overrides.leadTimeDays !== undefined) row.lead_time_days = overrides.leadTimeDays;
    if (overrides.fieldService !== undefined) row.field_service = overrides.fieldService;
    if (overrides.calloutFee !== undefined) row.callout_fee = overrides.calloutFee;
    if (overrides.travelCharge !== undefined) row.travel_charge = overrides.travelCharge;
    if (overrides.labour !== undefined) row.labour = overrides.labour;
    await supabase.from("quotes").update(row).eq("id", quoteId);
    setQuotes((qs) => qs.map((q) => (q.id === quoteId ? { ...q, ...overrides } : q)));
  };

  const rejectQuote = async (quoteId) => {
    await supabase.from("quotes").update({ status: "rejected" }).eq("id", quoteId);
    setQuotes((qs) => qs.map((q) => (q.id === quoteId ? { ...q, status: "rejected" } : q)));
  };

  const acceptQuote = async (quoteId, requestId) => {
    const req = requests.find((r) => r.id === requestId);
    const { error } = await supabase.rpc("accept_quote_by_token", {
      p_request_id: requestId,
      p_token: req?.accessToken ?? null,
      p_quote_id: quoteId,
    });
    if (error) { console.error("Accept failed", error); return; }

    const target = quotes.find((q) => q.id === quoteId);
    const fs = target?.fieldService;
    const confirmedFs = fs && fs.status === "quoted" ? { ...fs, status: "confirmed" } : fs;
    setQuotes((qs) => qs.map((q) => {
      if (q.id === quoteId) return { ...q, status: "accepted", fieldService: confirmedFs };
      if (q.requestId === requestId) return { ...q, status: "declined" };
      return q;
    }));
    setRequests((rs) => rs.map((r) => (r.id === requestId ? { ...r, status: "accepted" } : r)));
    loadAll();
  };

  const unlockContact = async (quoteId) => {
    const existing = connections.find((c) => c.quoteId === quoteId);
    const now = new Date().toISOString();
    if (existing) {
      await supabase.from("connections").update({ unlocked: true, unlocked_at: now }).eq("quote_id", quoteId);
      setConnections((cs) => cs.map((c) => (c.quoteId === quoteId ? { ...c, unlocked: true, unlockedAt: now } : c)));
    } else {
      const row = { id: `C-${Date.now()}`, quote_id: quoteId, unlocked: true, unlocked_at: now };
      await supabase.from("connections").insert(row);
      setConnections((cs) => [...cs, connectionFromRow(row)]);
    }
  };

  const requestFieldService = async (quoteId, siteAddress, accessNotes, labourHoursEstimate) => {
    const q = quotes.find((qt) => qt.id === quoteId);
    const pricing = pricingBySupplier[q?.supplierId];
    const fieldService = {
      requested: true, status: "pending", siteAddress, accessNotes,
      calloutFee: pricing?.calloutFee ?? 65, travelCharge: pricing?.travelBase ?? 45,
      customerLabourHours: labourHoursEstimate || null, labour: 0, labourHours: null, hourlyRate: null,
    };
    await supabase.from("quotes").update({ field_service: fieldService }).eq("id", quoteId);
    setQuotes((qs) => qs.map((qt) => (qt.id === quoteId ? { ...qt, fieldService } : qt)));
  };

  const updateFieldService = async (quoteId, calloutFee, travelCharge, labourHours, hourlyRate) => {
    const q = quotes.find((qt) => qt.id === quoteId);
    const labour = Math.round((parseFloat(labourHours) || 0) * (parseFloat(hourlyRate) || 0));
    const fieldService = { ...q.fieldService, calloutFee, travelCharge, labour, labourHours, hourlyRate, status: "quoted" };
    await supabase.from("quotes").update({ field_service: fieldService }).eq("id", quoteId);
    setQuotes((qs) => qs.map((qt) => (qt.id === quoteId ? { ...qt, fieldService } : qt)));
  };

  const confirmFieldService = async (quoteId) => {
    const q = quotes.find((qt) => qt.id === quoteId);
    const fieldService = { ...q.fieldService, status: "confirmed" };
    await supabase.from("quotes").update({ field_service: fieldService }).eq("id", quoteId);
    setQuotes((qs) => qs.map((qt) => (qt.id === quoteId ? { ...qt, fieldService } : qt)));
  };

  // NEW: mark a quote as fully completed (job done)
  const markComplete = async (quoteId) => {
    const now = new Date().toISOString();
    await supabase.from("quotes").update({ status: "completed", completed_at: now }).eq("id", quoteId);
    setQuotes((qs) => qs.map((q) => (q.id === quoteId ? { ...q, status: "completed", completedAt: now } : q)));
  };

  const savePricingFor = async (supplierId, next) => {
    await supabase.from("supplier_pricing").update(pricingToRow(next)).eq("supplier_id", supplierId);
    setPricingBySupplier((p) => ({ ...p, [supplierId]: next }));
  };

  const submitManualQuote = async (requestId, supplierId, priceLow, priceHigh, leadTimeDays) => {
    const id = `Q-${Date.now()}`;
    const row = { id, request_id: requestId, supplier_id: supplierId, price_low: priceLow, price_high: priceHigh, lead_time_days: leadTimeDays, quote_type: "manual", status: "confirmed" };
    await supabase.from("quotes").insert(row);
    setQuotes((q) => [quoteFromRow({ ...row, created_at: new Date().toISOString() }), ...q]);
  };

  // ---- Admin: supplier account management ----
  const addSupplier = async (companyName, passcode, serviceArea, contactEmail, contactPhone) => {
    const row = { company_name: companyName, passcode, service_area: serviceArea || "", contact_email: contactEmail || null, contact_phone: contactPhone || null };
    const { data: inserted } = await supabase.from("suppliers").insert([row]).select();
    const newSupplier = (inserted || []).map(supplierFromRow)[0];
    if (newSupplier) {
      setSuppliers((s) => [...s, newSupplier]);
      const pricingRow = { supplier_id: newSupplier.id, ...pricingToRow(defaultPricing(1)) };
      await supabase.from("supplier_pricing").insert([pricingRow]);
      setPricingBySupplier((p) => ({ ...p, [newSupplier.id]: defaultPricing(1) }));
    }
    return newSupplier;
  };

  const updateSupplier = async (supplierId, fields) => {
    const row = {};
    if (fields.companyName !== undefined) row.company_name = fields.companyName;
    if (fields.passcode !== undefined) row.passcode = fields.passcode;
    if (fields.serviceArea !== undefined) row.service_area = fields.serviceArea;
    if (fields.contactEmail !== undefined) row.contact_email = fields.contactEmail;
    if (fields.contactPhone !== undefined) row.contact_phone = fields.contactPhone;
    await supabase.from("suppliers").update(row).eq("id", supplierId);
    setSuppliers((ss) => ss.map((s) => (s.id === supplierId ? { ...s, ...fields } : s)));
  };

  const deleteSupplier = async (supplierId) => {
    await supabase.from("suppliers").delete().eq("id", supplierId);
    setSuppliers((ss) => ss.filter((s) => s.id !== supplierId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  const currentSupplier = suppliers.find((s) => s.id === session);

  return (
    <div className="min-h-screen bg-[#0B0B0C] font-sans" style={{ colorScheme: "dark" }}>
      <header className="border-b border-neutral-800 sticky top-0 bg-[#0B0B0C] z-10">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-white font-extrabold leading-none">HoseQuote</div>
          </div>
          <div className="flex items-center gap-3">
            {view === "customer" && (
              <div className="flex items-center gap-2 text-sm">
                {customer ? (
                  <>
                    <button
                      onClick={() => { setFlowType(null); setCustomerView("mine"); }}
                      className="text-neutral-300 hover:text-white font-semibold"
                    >
                      My requests
                    </button>
                    <button onClick={signOut} title="Sign out" aria-label="Sign out" className="text-neutral-500 hover:text-white">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setFlowType(null); setCustomerView("auth"); }}
                    className="text-orange-500 hover:text-orange-400 font-semibold"
                  >
                    Sign in
                  </button>
                )}
              </div>
            )}
          <nav className="flex items-center gap-1 bg-neutral-900 rounded-lg p-1">
            {[
              { key: "customer", icon: Droplet, label: "Quote" },
              { key: "supplier", icon: Building2, label: "Supplier Portal" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`p-2 rounded-md transition-colors ${view === t.key ? "bg-orange-500 text-black" : "text-neutral-400 hover:text-white"}`}
                aria-label={t.label}
                title={t.label}
              >
                <t.icon className="w-4 h-4" />
              </button>
            ))}
          </nav>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {view === "customer" && flowType === null && customerView === "new" && (
          <FlowChooser
            onChoose={setFlowType}
            customer={customer}
            onSignIn={() => setCustomerView("auth")}
            onMine={() => setCustomerView("mine")}
          />
        )}
        {view === "customer" && flowType === null && customerView === "auth" && (
          <CustomerAuth onBack={() => setCustomerView("new")} />
        )}
        {view === "customer" && flowType === null && customerView === "mine" && (
          customer ? (
            <MyRequests
              customerId={customer.id}
              email={customer.email}
              onNew={() => setCustomerView("new")}
            />
          ) : (
            <CustomerAuth
              onSignedIn={() => setCustomerView("mine")}
              onBack={() => setCustomerView("new")}
            />
          )
        )}
        {view === "customer" && flowType === "quote" && (
          <CustomerFlow
            form={form} update={update} errors={errors} step={step}
            next={next} back={back} submit={submit}
            updateAssembly={updateAssembly} addAssembly={addAssembly} removeAssembly={removeAssembly}
            suppliers={suppliers} pricingBySupplier={pricingBySupplier}
            submittedRequestId={submittedRequestId} resetWizard={resetWizard}
            quotes={quotes} acceptQuote={acceptQuote}
            requestFieldService={requestFieldService} confirmFieldService={confirmFieldService}
            onBack={() => setFlowType(null)}
          />
        )}
        {view === "customer" && flowType === "booking" && (
          <BookingFlow
            suppliers={suppliers} pricingBySupplier={pricingBySupplier}
            requests={requests} quotes={quotes}
            onSubmitBooking={async (record, newQuote) => {
              const row = {
                id: record.id, request_type: "booking", status: "open", location: record.location,
                customer_id: customer?.id ?? null,
                urgency: record.urgency, selected_supplier_id: record.selectedSupplierId,
                name: record.name, phone: record.phone, email: record.email, preferred_time: record.preferredTime,
                notes: record.notes, photo_url: record.photoUrl, equipment_type: record.equipmentType,
                issue: record.issue, description: record.description, labour_hours_estimate: record.labourHoursEstimate,
              };
              const { data: insertedReq } = await supabase.from("requests").insert(row).select().single();
              setRequests((rs) => [requestFromRow(insertedReq ?? { ...row, created_at: new Date().toISOString() }), ...rs]);
              if (newQuote) {
                const qrow = {
                  id: newQuote.id, request_id: record.id, supplier_id: newQuote.supplierId, is_booking: true,
                  price_low: newQuote.priceLow, price_high: newQuote.priceHigh,
                  callout_fee: newQuote.calloutFee, travel_charge: newQuote.travelCharge, labour: newQuote.labour,
                  customer_labour_hours: newQuote.customerLabourHours, hose_assembly_cost: 0,
                  lead_time_days: newQuote.leadTimeDays, quote_type: "auto", status: "pending",
                };
                await supabase.rpc("create_auto_quote", { q: qrow });
                setQuotes((qs) => [quoteFromRow({ ...qrow, created_at: new Date().toISOString() }), ...qs]);
              }
            }}
            acceptQuote={acceptQuote}
            onBack={() => setFlowType(null)}
            step={bookingStep} setStep={setBookingStep}
            form={bookingForm} setForm={setBookingForm}
            errors={bookingErrors} setErrors={setBookingErrors}
            submittedRequestId={bookingSubmittedRequestId} setSubmittedRequestId={setBookingSubmittedRequestId}
          />
        )}
        {view === "supplier" && !customer && (
          <SupplierAuth onBack={() => setView("customer")} />
        )}
        {view === "supplier" && customer && !supplierResolved && (
          <div className="text-center py-16 text-neutral-500">Signing you in…</div>
        )}
        {view === "supplier" && customer && supplierResolved && !isAdmin && !session && (
          <SupplierNotLinked email={customer.email} onSignOut={signOut} />
        )}
        {view === "supplier" && customer && supplierResolved && isAdmin && (
          <AdminPortal
            onLogout={signOut}
            suppliers={suppliers}
            pricingBySupplier={pricingBySupplier}
            requests={requests}
            quotes={quotes}
            connections={connections}
            onSavePricing={savePricingFor}
            onSubmitManualQuote={submitManualQuote}
            onUnlock={unlockContact}
            onConfirmQuote={confirmQuote}
            onRejectQuote={rejectQuote}
            onUpdateFieldService={updateFieldService}
            onMarkComplete={markComplete}
            onEditQuote={editQuote}
            onAddSupplier={addSupplier}
            onUpdateSupplier={updateSupplier}
            onDeleteSupplier={deleteSupplier}
          />
        )}
        {view === "supplier" && customer && supplierResolved && !isAdmin && session && currentSupplier && (
          <SupplierPortal
            supplier={currentSupplier}
            onLogout={signOut}
            requests={requests}
            quotes={quotes}
            connections={connections}
            pricing={pricingBySupplier[session]}
            onSavePricing={(next) => savePricingFor(session, next)}
            onSubmitManualQuote={(requestId, priceLow, priceHigh, leadTimeDays) => submitManualQuote(requestId, session, priceLow, priceHigh, leadTimeDays)}
            onUnlock={unlockContact}
            onConfirmQuote={confirmQuote}
            onRejectQuote={rejectQuote}
            onUpdateFieldService={updateFieldService}
            onMarkComplete={markComplete}
          />
        )}
      </main>
    </div>
  );
}

function StepDot({ n, active, done }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
      done ? "bg-orange-500 border-orange-500 text-black" : active ? "border-orange-500 text-orange-500" : "border-neutral-700 text-neutral-600"
    }`}>
      {n}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-white font-bold text-lg mb-1">
        <Icon className="w-4 h-4 text-orange-500" /> {title}
      </div>
      {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
    </div>
  );
}

function AssemblyCard({ assembly: a, index, errors, onChange, onRemove }) {
  const ek = (field) => errors[`asm_${index}_${field}`];
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-orange-500 text-xs font-bold tracking-wide">ASSEMBLY {index + 1}</div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-neutral-500 hover:text-red-400 font-semibold">
            Remove
          </button>
        )}
      </div>

      <Field label="Hose Category" required>
        <div className="grid grid-cols-2 gap-3">
          {["hydraulic_oil", "pressure_washer"].map((c) => (
            <button key={c} type="button" onClick={() => { onChange("category", c); onChange("bore", ""); onChange("hoseType", ""); }}
              className={`py-2.5 rounded-lg border font-semibold text-sm transition-colors ${a.category === c ? "border-orange-500 bg-orange-500/10 text-orange-500" : "border-neutral-700 text-neutral-300"}`}>
              {c === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Hose Type" required error={ek("hoseType")}>
        <select className={inputClass(ek("hoseType"))} value={a.hoseType} onChange={(e) => onChange("hoseType", e.target.value)}>
          <option className="bg-neutral-900 text-white" value="">Select type...</option>
          {HOSE_TYPES[a.category].map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Internal Diameter / Bore" required error={ek("bore")}>
        <select className={inputClass(ek("bore"))} value={a.bore} onChange={(e) => onChange("bore", e.target.value)}>
          <option className="bg-neutral-900 text-white" value="">Select bore...</option>
          {BORES[a.category].map((b) => <option className="bg-neutral-900 text-white" key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Length (metres)" required error={ek("length")}>
          <input type="number" step="0.1" placeholder="e.g. 2.5" className={inputClass(ek("length"))} value={a.length} onChange={(e) => onChange("length", e.target.value)} />
        </Field>
        <Field label="Quantity" required>
          <input type="number" min="1" className={inputClass()} value={a.quantity} onChange={(e) => onChange("quantity", e.target.value)} />
        </Field>
      </div>
      <Field label="Working Pressure" required error={ek("pressure")}>
        <div className="flex gap-3">
          <input type="number" placeholder="e.g. 3000" className={inputClass(ek("pressure"))} value={a.pressure} onChange={(e) => onChange("pressure", e.target.value)} />
          <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">PSI</div>
        </div>
      </Field>

      {["A", "B"].map((side) => (
        <div key={side} className="border border-neutral-800 rounded-lg p-3 mb-4">
          <div className="text-orange-500 text-xs font-bold tracking-wide mb-3">FITTING {side}</div>
          <Field label="Type" required error={ek(`fitting${side}Type`)}>
            <select className={inputClass(ek(`fitting${side}Type`))} value={a[`fitting${side}Type`]} onChange={(e) => onChange(`fitting${side}Type`, e.target.value)}>
              <option className="bg-neutral-900 text-white" value="">Select fitting...</option>
              {FITTING_TYPES.map((f) => <option className="bg-neutral-900 text-white" key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Orientation" required>
            <select className={inputClass()} value={a[`fitting${side}Orientation`]} onChange={(e) => onChange(`fitting${side}Orientation`, e.target.value)}>
              {ORIENTATIONS.map((o) => <option className="bg-neutral-900 text-white" key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      ))}
    </div>
  );
}

function FlowChooser({ onChoose, customer, onSignIn, onMine }) {
  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Droplet className="w-3.5 h-3.5" /> Hydraulic Hose Service
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">What do you need?</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Get competing quotes on a hose assembly, or book a technician to come to you.</p>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onChoose("quote")}
          className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-6 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-4">
            <Wrench className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-white font-bold text-lg mb-1 group-hover:text-orange-500 transition-colors">Get a Hose Quote</div>
          <p className="text-neutral-500 text-sm">Specify your hose and fitting requirements and compare indicative prices from suppliers. On-site installation can be added as part of your quote.</p>
        </button>

        <button
          type="button"
          onClick={() => onChoose("booking")}
          className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-6 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-4">
            <Truck className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-white font-bold text-lg mb-1 group-hover:text-orange-500 transition-colors">Book a Field Service Job</div>
          <p className="text-neutral-500 text-sm">Not sure of the exact hose spec yet? Book a technician to come assess and fix it on site — describe the job and get indicative callout pricing.</p>
        </button>
      </div>

      <div className="text-center mt-6 text-sm">
        {customer ? (
          <p className="text-neutral-500">
            Signed in as <span className="text-neutral-300">{customer.email}</span> ·{" "}
            <button onClick={onMine} className="text-orange-500 hover:text-orange-400 font-semibold">
              My requests
            </button>
          </p>
        ) : (
          <p className="text-neutral-500">
            Been here before?{" "}
            <button onClick={onSignIn} className="text-orange-500 hover:text-orange-400 font-semibold">
              Sign in
            </button>{" "}
            to track and accept your quotes.
          </p>
        )}
      </div>
    </div>
  );
}

function CustomerAuth({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sendLink = async () => {
    const addr = email.trim();
    if (!addr) return;
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="max-w-sm mx-auto">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-3">
          <User className="w-6 h-6 text-orange-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">
          {sent ? "Check your email" : "Sign in"}
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          {sent
            ? `We sent a sign-in link to ${email.trim()}. Open it and you're in — no password needed.`
            : "Enter your email and we'll send you a one-tap sign-in link."}
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {sent ? (
        <button
          onClick={() => { setSent(false); setErr(""); }}
          className="w-full text-sm text-neutral-400 hover:text-white"
        >
          Use a different email
        </button>
      ) : (
        <>
          <Field label="Email" required>
            <input
              type="email"
              autoFocus
              placeholder="you@example.com"
              className={inputClass()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
            />
          </Field>
          <button
            onClick={sendLink}
            disabled={busy || !email.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold py-3 rounded-lg transition-colors"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </>
      )}
    </div>
  );
}

const MY_REQ_STATUS = {
  open: { label: "Awaiting quote", tone: "neutral" },
  accepted: { label: "Accepted", tone: "orange" },
};

function MyRequests({ customerId, email, onNew }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    supabase
      .from("requests")
      .select("id, request_type, status, location, created_at, access_token")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, [customerId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">My requests</h1>
          <p className="text-neutral-500 text-sm">{email}</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New request
        </button>
      </div>

      {rows === null && <p className="text-neutral-500">Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <div className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
          Nothing here yet. Requests you submit while signed in — or any past
          requests that used <span className="text-neutral-300">{email}</span> —
          will appear here.
        </div>
      )}

      <div className="space-y-3">
        {(rows || []).map((r) => {
          const meta = MY_REQ_STATUS[r.status] || { label: r.status, tone: "neutral" };
          return (
            <a
              key={r.id}
              href={`/r/${encodeURIComponent(r.id)}?t=${r.access_token}`}
              className="block bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-orange-500 text-sm">{r.id}</span>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <div className="text-sm text-neutral-400">
                {r.request_type === "booking" ? "Field service booking" : "Hose quote request"}
                {r.location ? ` · ${r.location}` : ""}
                {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString()}` : ""}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function CustomerFlow({ form, update, errors, step, next, back, submit, updateAssembly, addAssembly, removeAssembly, suppliers, pricingBySupplier, submittedRequestId, resetWizard, quotes, acceptQuote, requestFieldService, confirmFieldService, onBack }) {
  const previewQuotes = suppliers
    .filter((s) => areasMatch(form.location, s.serviceArea))
    .map((s) => ({ supplierId: s.id, est: calcEstimate(form, pricingBySupplier[s.id]) }))
    .filter((pq) => pq.est)
    .sort((a, b) => a.est.low - b.est.low);
  const selectedSupplierName = suppliers.find((s) => s.id === form.selectedSupplierId)?.companyName;
  if (submittedRequestId) {
    const myQuotes = quotes.filter((q) => q.requestId === submittedRequestId && q.status !== "declined").sort((a, b) => a.priceLow - b.priceLow);
    const accepted = myQuotes.find((q) => q.status === "accepted" || q.status === "completed");
    return (
      <div>
        <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-6 text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-1">Request sent</h2>
          <p className="text-neutral-400">Reference <span className="text-orange-500 font-mono">{submittedRequestId}</span></p>
          {selectedSupplierName && (
            <p className="text-xs text-amber-500/80 mt-3 border-t border-neutral-800 pt-3">
              🛠 Testing note (not shown to real customers): this went to <strong>{selectedSupplierName}</strong> — log into the Supplier Portal as this company to confirm it.
            </p>
          )}
        </div>

        <div className="text-white font-bold mb-3">
          {myQuotes.some((q) => q.status !== "rejected") ? "Your quote" : "Update from supplier"}
        </div>
        {myQuotes.length === 0 && (
          <div className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800 rounded-xl mb-6">
            This supplier is no longer available for this request. Try submitting again.
          </div>
        )}
        <div className="space-y-3 mb-6">
          {myQuotes.map((q, idx) => {
            const s = suppliers.find((sp) => sp.id === q.supplierId);
            const isAccepted = q.status === "accepted" || q.status === "completed";
            const isConfirmed = q.status === "confirmed" || isAccepted;
            const isRejected = q.status === "rejected";
            const isCompleted = q.status === "completed";
            const displayName = isConfirmed ? (s?.companyName || "Supplier") : `Supplier ${idx + 1}`;

            if (isRejected) {
              return (
                <div key={q.id} className="rounded-xl p-5 border border-red-500/30 bg-red-500/5">
                  <div className="text-white font-bold mb-1">This supplier can't take this job</div>
                  <p className="text-sm text-neutral-400">Try submitting a new request and choosing a different supplier.</p>
                </div>
              );
            }

            return (
              <div key={q.id} className={`rounded-xl p-5 border ${isAccepted ? "border-orange-500 bg-orange-500/5" : "border-neutral-800 bg-neutral-900"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={isConfirmed ? "text-white font-bold" : "text-neutral-400 font-bold italic"}>{displayName}</div>
                    {!isConfirmed && <span title="Name revealed once the supplier confirms this quote"><Clock className="w-3.5 h-3.5 text-neutral-600" /></span>}
                  </div>
                  {isCompleted && <Badge tone="green">Job completed</Badge>}
                  {isAccepted && !isCompleted && <Badge tone="orange">Accepted</Badge>}
                  {!isConfirmed && <Badge tone="neutral">Awaiting confirmation</Badge>}
                </div>

                {(() => {
                  const ct = combinedTotal(q);
                  const fs = q.fieldService;
                  const showBreakdown = ct.hasOnSite && (fs?.status === "quoted" || fs?.status === "confirmed");
                  if (!showBreakdown) {
                    return (
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-extrabold text-orange-500">${ct.low} – ${ct.high}</div>
                        <div className="text-sm text-neutral-500">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} lead time</div>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-black/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">Hose assembly</span>
                        <span className="text-white font-semibold">${q.priceLow} – ${q.priceHigh}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">On-site callout &amp; travel</span>
                        <span className="text-white font-semibold">${fs.calloutFee + fs.travelCharge}</span>
                      </div>
                      {fs.labour > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-300">On-site labour{fs.labourHours ? ` (${fs.labourHours}h @ $${fs.hourlyRate}/hr)` : ""}</span>
                          <span className="text-white font-semibold">${fs.labour}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
                        <span className="text-sm font-bold text-orange-500">Total</span>
                        <span className="text-2xl font-extrabold text-orange-500">${ct.low} – ${ct.high}</span>
                      </div>
                      <div className="text-xs text-neutral-500 text-right">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} lead time</div>
                    </div>
                  );
                })()}

                {!accepted && isConfirmed && !isAccepted && (
                  <button onClick={() => acceptQuote(q.id, submittedRequestId)} className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">
                    Accept this quote
                  </button>
                )}
                {!isConfirmed && (
                  <p className="text-xs text-neutral-600 mt-3">This supplier hasn't confirmed their quote yet — their name and an accept option will appear once they do.</p>
                )}
                {isConfirmed && (
                  <FieldServiceSection quote={q} requestFieldService={requestFieldService} confirmFieldService={confirmFieldService} />
                )}
              </div>
            );
          })}
        </div>

        <button onClick={resetWizard} className="w-full border border-neutral-700 text-neutral-300 font-semibold px-6 py-3 rounded-lg transition-colors hover:border-orange-500 hover:text-white">
          Request another quote
        </button>
      </div>
    );
  }

  return (
    <div>
      {onBack && step === 1 && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Droplet className="w-3.5 h-3.5" /> Hydraulic Hose Quote Service
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Get Competing Hose Quotes</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Submit your requirements once and hear back from multiple suppliers.</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center justify-between">
        <span className="text-white font-semibold">Step {step} of 3 — {["Hose details", "Fittings & urgency", "Contact details"][step - 1]}</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => <StepDot key={n} n={n} active={n === step} done={n < step} />)}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        {step === 1 && (
          <>
            <SectionTitle icon={Wrench} title="Hose Assemblies" subtitle="Add each hose you need — you can request several in one quote." />
            <div className="space-y-4 mb-4">
              {form.assemblies.map((a, idx) => (
                <AssemblyCard
                  key={a.id} assembly={a} index={idx} errors={errors}
                  onChange={(key, value) => updateAssembly(idx, key, value)}
                  onRemove={form.assemblies.length > 1 ? () => removeAssembly(idx) : null}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addAssembly}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-400 font-semibold py-3 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add another hose assembly
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <SectionTitle icon={Gauge} title="Urgency & Location" />
            <Field label="Urgency" required>
              <div className="grid grid-cols-3 gap-3">
                {URGENCY.map((u) => (
                  <button key={u.key} onClick={() => update("urgency", u.key)}
                    className={`py-3 px-2 rounded-lg border text-center transition-colors ${form.urgency === u.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"}`}>
                    <div className={form.urgency === u.key ? "text-orange-500 font-bold" : "text-neutral-300 font-bold"}>{u.label}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{u.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Suburb or Postcode" required error={errors.location}>
              <div className="relative">
                <MapPin className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input placeholder="e.g. Maroochydore or 4558" className={inputClass(errors.location) + " pl-10"} value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
            </Field>

            <button
              type="button"
              onClick={() => update("fieldServiceRequested", !form.fieldServiceRequested)}
              className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 mb-5 transition-colors ${
                form.fieldServiceRequested ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"
              }`}
            >
              <span className="text-left">
                <span className={`block font-semibold ${form.fieldServiceRequested ? "text-orange-500" : "text-white"}`}>On-site installation / service</span>
                <span className="block text-xs text-neutral-500 mt-0.5">Have a supplier come to you, instead of collecting the hose yourself</span>
              </span>
              <span className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${form.fieldServiceRequested ? "bg-orange-500 justify-end" : "bg-neutral-700 justify-start"}`}>
                <span className="w-5 h-5 rounded-full bg-white" />
              </span>
            </button>

            {form.fieldServiceRequested && (
              <>
                <Field label="Site Address" required error={errors.siteAddress}>
                  <input placeholder="Full address for the callout" className={inputClass(errors.siteAddress)} value={form.siteAddress} onChange={(e) => update("siteAddress", e.target.value)} />
                </Field>
                <Field label="Site Access Notes (optional)" hint="Gate codes, parking, machine location, etc.">
                  <textarea rows={2} className={inputClass()} value={form.accessNotes} onChange={(e) => update("accessNotes", e.target.value)} />
                </Field>
                <Field label="Estimated Installation Time (optional)" hint="How long do you think the on-site work will take? The supplier will confirm the actual labour cost.">
                  <div className="flex gap-3">
                    <input type="number" step="0.5" placeholder="e.g. 1" className={inputClass()} value={form.fsLabourHoursEstimate} onChange={(e) => update("fsLabourHoursEstimate", e.target.value)} />
                    <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
                  </div>
                </Field>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <SectionTitle icon={User} title="Your Contact Details" />
            <Field label="Full Name" required error={errors.name}>
              <input placeholder="e.g. John Smith" className={inputClass(errors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={errors.phone}>
                <input placeholder="e.g. 0412 345 678" className={inputClass(errors.phone)} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input placeholder="e.g. john@example.com" className={inputClass(errors.email)} value={form.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Preferred Date / Time" hint="When would you like the service?">
              <input placeholder="e.g. Tomorrow morning" className={inputClass()} value={form.preferredTime} onChange={(e) => update("preferredTime", e.target.value)} />
            </Field>
            <Field label="Notes (optional)" hint="Any extra details about the job, access, timing, etc.">
              <textarea rows={3} placeholder="e.g. Hose is on an excavator, need mobile service on site." className={inputClass()} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </Field>
            <Field label="Photo URL (optional)" hint="Link to a photo of the hose or fitting if available">
              <input placeholder="https://..." className={inputClass()} value={form.photoUrl} onChange={(e) => update("photoUrl", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {previewQuotes.length > 0 && step < 3 && (
        <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-white font-bold flex items-center gap-2"><Gauge className="w-4 h-4 text-orange-500" /> Indicative Price</div>
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full font-semibold">Indicative</span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Select a supplier to proceed with. Names appear once they confirm your request.</p>
          <div className="space-y-2 mb-1">
            {previewQuotes.map((pq, idx) => {
              const selected = form.selectedSupplierId === pq.supplierId;
              const displayLow = pq.est.low + pq.est.callout;
              const displayHigh = pq.est.high + pq.est.callout;
              return (
                <button
                  type="button"
                  key={pq.supplierId}
                  onClick={() => update("selectedSupplierId", pq.supplierId)}
                  className={`w-full rounded-lg px-4 py-3 border transition-colors ${
                    selected ? "border-orange-500 bg-orange-500/10" : "border-transparent bg-black/30 hover:border-neutral-700"
                  }`}
                >
                  <div className={`text-sm font-medium mb-2 text-left ${selected ? "text-orange-500" : "text-neutral-400"}`}>
                    {selected && "✓ "}Supplier {idx + 1}
                  </div>

                  {form.fieldServiceRequested ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">Hose assembly</span>
                        <span className="text-white font-semibold">${pq.est.low} – ${pq.est.high}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-400">On-site callout</span>
                        <span className="text-white font-semibold">${pq.est.callout}</span>
                      </div>
                      <div className={`flex items-center justify-between pt-1.5 border-t ${selected ? "border-orange-500/30" : "border-neutral-700"}`}>
                        <span className={`text-sm font-bold ${selected ? "text-orange-500" : "text-white"}`}>Total</span>
                        <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${displayLow} – ${displayHigh}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-400">Total</span>
                      <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${displayLow} – ${displayHigh}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {errors.selectedSupplierId && <p className="text-xs text-red-400 mt-2">{errors.selectedSupplierId}</p>}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={back} disabled={step === 1} className="flex items-center gap-2 px-5 py-3 rounded-lg border border-neutral-700 text-neutral-300 disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < 3 ? (
          <button onClick={next} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={submit} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Get Quotes <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function FieldServiceSection({ quote, requestFieldService, confirmFieldService }) {
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [hours, setHours] = useState("");
  const fs = quote.fieldService;

  if (!fs || !fs.requested) {
    return showForm ? (
      <div className="mt-4 border-t border-neutral-800 pt-4 space-y-3">
        <div className="text-white font-semibold text-sm">Request on-site installation / service</div>
        <input placeholder="Site address" className={inputClass()} value={address} onChange={(e) => setAddress(e.target.value)} />
        <textarea rows={2} placeholder="Site access notes (optional)" className={inputClass()} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex gap-3">
          <input type="number" step="0.5" placeholder="Estimated hours (optional)" className={inputClass()} value={hours} onChange={(e) => setHours(e.target.value)} />
          <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (address) { requestFieldService(quote.id, address, notes, hours); setShowForm(false); } }}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg text-sm transition-colors"
          >
            Send request
          </button>
          <button onClick={() => setShowForm(false)} className="px-4 border border-neutral-700 text-neutral-300 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    ) : (
      <button onClick={() => setShowForm(true)} className="mt-4 w-full border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 text-sm font-semibold py-2.5 rounded-lg transition-colors">
        + Request on-site installation / service
      </button>
    );
  }

  if (fs.status === "pending") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <Badge tone="neutral">Service request sent</Badge>
        <p className="text-xs text-neutral-500 mt-2">Waiting on the supplier to confirm callout, travel and labour charges for {fs.siteAddress}.</p>
      </div>
    );
  }

  if (fs.status === "quoted") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <div className="text-white font-semibold text-sm mb-1">On-site service at {fs.siteAddress}</div>
        <p className="text-xs text-neutral-500 mb-3">Callout, travel and labour charges are included in the total above.</p>
        <button onClick={() => confirmFieldService(quote.id)} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg text-sm transition-colors">
          Confirm — I'm happy with this
        </button>
      </div>
    );
  }

  if (fs.status === "confirmed") {
    return (
      <div className="mt-4 border-t border-neutral-800 pt-4">
        <Badge tone="green">On-site service confirmed</Badge>
        <div className="text-sm text-neutral-400 mt-2">{fs.siteAddress} — included in the total above</div>
      </div>
    );
  }

  return null;
}

function BookingFlow({ suppliers, pricingBySupplier, requests, quotes, onSubmitBooking, acceptQuote, onBack, step, setStep, form, setForm, errors, setErrors, submittedRequestId, setSubmittedRequestId }) {
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const previewQuotes = suppliers
    .filter((s) => areasMatch(form.location, s.serviceArea))
    .map((s) => ({ supplierId: s.id, est: calcBookingEstimate(form, pricingBySupplier[s.id]) }))
    .filter((pq) => pq.est)
    .sort((a, b) => a.est.low - b.est.low);

  const validateStep = (s) => {
    const e = {};
    if (s === 1) {
      if (!form.equipmentType) e.equipmentType = "Select the equipment type.";
      if (!form.issue) e.issue = "Select what's wrong / what's needed.";
    }
    if (s === 2) {
      if (!form.location) e.location = "Enter the job location.";
      if (!form.selectedSupplierId) e.selectedSupplierId = "Select a supplier to continue.";
    }
    if (s === 3) {
      if (!form.name) e.name = "Enter your full name.";
      if (!form.phone && !form.email) {
        e.phone = "Enter at least a phone number or email.";
        e.email = "Enter at least a phone number or email.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep((s) => Math.min(3, s + 1)); };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    if (!validateStep(3)) return;
    const id = `HQ-B-${Date.now()}`;
    const record = { id, ...form };
    const pricing = pricingBySupplier[form.selectedSupplierId];
    const est = calcBookingEstimate(form, pricing);
    const newQuote = est ? {
      id: `Q-${Date.now()}-${form.selectedSupplierId}`, supplierId: form.selectedSupplierId,
      priceLow: est.low, priceHigh: est.high,
      calloutFee: est.calloutFee, travelCharge: est.travelCharge, labour: est.labour, customerLabourHours: form.labourHoursEstimate || null,
      leadTimeDays: form.urgency === "emergency" ? 1 : form.urgency === "priority" ? 2 : 4,
    } : null;

    await onSubmitBooking(record, newQuote);
    setSubmittedRequestId(id);
  };

  const resetBooking = () => { setForm(emptyBookingForm()); setStep(1); setSubmittedRequestId(null); setErrors({}); onBack(); };

  if (submittedRequestId) {
    const myQuotes = quotes.filter((q) => q.requestId === submittedRequestId && q.status !== "declined").sort((a, b) => a.priceLow - b.priceLow);
    const accepted = myQuotes.find((q) => q.status === "accepted" || q.status === "completed");
    return (
      <div>
        <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-6 text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6 text-orange-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-1">Booking request sent</h2>
          <p className="text-neutral-400">Reference <span className="text-orange-500 font-mono">{submittedRequestId}</span></p>
        </div>

        <div className="text-white font-bold mb-3">Booking status</div>
        {myQuotes.length === 0 && (
          <div className="text-center py-10 text-neutral-500 border border-dashed border-neutral-800 rounded-xl mb-6">
            This supplier is no longer available for this booking. Try submitting again.
          </div>
        )}
        <div className="space-y-3 mb-6">
          {myQuotes.map((q, idx) => {
            const s = suppliers.find((sp) => sp.id === q.supplierId);
            const isAccepted = q.status === "accepted" || q.status === "completed";
            const isConfirmed = q.status === "confirmed" || isAccepted;
            const isRejected = q.status === "rejected";
            const isCompleted = q.status === "completed";
            const displayName = isConfirmed ? (s?.companyName || "Supplier") : `Supplier ${idx + 1}`;

            if (isRejected) {
              return (
                <div key={q.id} className="rounded-xl p-5 border border-red-500/30 bg-red-500/5">
                  <div className="text-white font-bold mb-1">This supplier can't take this job</div>
                  <p className="text-sm text-neutral-400">Try submitting a new booking and choosing a different supplier.</p>
                </div>
              );
            }

            return (
              <div key={q.id} className={`rounded-xl p-5 border ${isAccepted ? "border-orange-500 bg-orange-500/5" : "border-neutral-800 bg-neutral-900"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={isConfirmed ? "text-white font-bold" : "text-neutral-400 font-bold italic"}>{displayName}</div>
                    {!isConfirmed && <span title="Name revealed once the supplier confirms this booking"><Clock className="w-3.5 h-3.5 text-neutral-600" /></span>}
                  </div>
                  {isCompleted && <Badge tone="green">Job completed</Badge>}
                  {isAccepted && !isCompleted && <Badge tone="orange">Accepted</Badge>}
                  {!isConfirmed && <Badge tone="neutral">Awaiting confirmation</Badge>}
                </div>

                {isConfirmed ? (
                  <div className="bg-black/30 rounded-lg p-3 space-y-2 mb-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Callout fee</span>
                      <span className="text-white font-semibold">${q.calloutFee}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Travel charge</span>
                      <span className="text-white font-semibold">${q.travelCharge}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-300">Labour{q.labourHours ? ` (${q.labourHours}h @ $${q.hourlyRate}/hr)` : ""}</span>
                      <span className="text-white font-semibold">${q.labour}</span>
                    </div>
                    {q.hoseAssemblyCost > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-300">Hose assembly / materials</span>
                        <span className="text-white font-semibold">${q.hoseAssemblyCost}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
                      <span className="text-sm font-bold text-orange-500">Total</span>
                      <span className="text-2xl font-extrabold text-orange-500">${q.priceLow} – ${q.priceHigh}</span>
                    </div>
                    <div className="text-xs text-neutral-500 text-right">~{q.leadTimeDays} day{q.leadTimeDays !== 1 ? "s" : ""} until technician arrives</div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">This supplier hasn't confirmed callout pricing and timeframe yet.</p>
                )}

                {!accepted && isConfirmed && !isAccepted && (
                  <button onClick={() => acceptQuote(q.id, submittedRequestId)} className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">
                    Accept &amp; Confirm Booking
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={resetBooking} className="w-full border border-neutral-700 text-neutral-300 font-semibold px-6 py-3 rounded-lg transition-colors hover:border-orange-500 hover:text-white">
          Back to start
        </button>
      </div>
    );
  }

  return (
    <div>
      {step === 1 && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Truck className="w-3.5 h-3.5" /> Field Service Booking
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Book a Technician</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Tell us about the job and we'll get you indicative pricing and a timeframe.</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 flex items-center justify-between">
        <span className="text-white font-semibold">Step {step} of 3 — {["Job details", "Location & supplier", "Contact details"][step - 1]}</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => <StepDot key={n} n={n} active={n === step} done={n < step} />)}
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        {step === 1 && (
          <>
            <SectionTitle icon={ClipboardList} title="Job Details" />
            <Field label="Equipment Type" required error={errors.equipmentType}>
              <select className={inputClass(errors.equipmentType)} value={form.equipmentType} onChange={(e) => update("equipmentType", e.target.value)}>
                <option className="bg-neutral-900 text-white" value="">Select equipment...</option>
                {EQUIPMENT_TYPES.map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="What's wrong / what's needed" required error={errors.issue}>
              <select className={inputClass(errors.issue)} value={form.issue} onChange={(e) => update("issue", e.target.value)}>
                <option className="bg-neutral-900 text-white" value="">Select an issue...</option>
                {JOB_ISSUES.map((t) => <option className="bg-neutral-900 text-white" key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Additional details (optional)" hint="Anything that helps the technician prepare — hose size if known, machine make/model, access, etc.">
              <textarea rows={4} placeholder="e.g. 3/8 hose burst on the boom ram of a 5-tonne excavator, on-site in a paddock." className={inputClass()} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </Field>
            <Field label="Estimated Labour Time (optional)" hint="How long do you think the job will take? The supplier will confirm the actual labour cost.">
              <div className="flex gap-3">
                <input type="number" step="0.5" placeholder="e.g. 1" className={inputClass()} value={form.labourHoursEstimate} onChange={(e) => update("labourHoursEstimate", e.target.value)} />
                <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-400 whitespace-nowrap">hours</div>
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <SectionTitle icon={Gauge} title="Location &amp; Priority" />
            <Field label="Job Location" required error={errors.location}>
              <div className="relative">
                <MapPin className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input placeholder="Full address or suburb where the job is" className={inputClass(errors.location) + " pl-10"} value={form.location} onChange={(e) => update("location", e.target.value)} />
              </div>
            </Field>
            <Field label="Priority" required>
              <div className="grid grid-cols-3 gap-3">
                {URGENCY.map((u) => (
                  <button key={u.key} type="button" onClick={() => update("urgency", u.key)}
                    className={`py-3 px-2 rounded-lg border text-center transition-colors ${form.urgency === u.key ? "border-orange-500 bg-orange-500/10" : "border-neutral-700"}`}>
                    <div className={form.urgency === u.key ? "text-orange-500 font-bold" : "text-neutral-300 font-bold"}>{u.label}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{u.desc}</div>
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <SectionTitle icon={User} title="Your Contact Details" />
            <Field label="Full Name" required error={errors.name}>
              <input placeholder="e.g. John Smith" className={inputClass(errors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" error={errors.phone}>
                <input placeholder="e.g. 0412 345 678" className={inputClass(errors.phone)} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input placeholder="e.g. john@example.com" className={inputClass(errors.email)} value={form.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
            </div>
            <Field label="Preferred Date / Time" hint="When would you like the technician to come?">
              <input placeholder="e.g. Tomorrow morning" className={inputClass()} value={form.preferredTime} onChange={(e) => update("preferredTime", e.target.value)} />
            </Field>
            <Field label="Notes (optional)" hint="Site access, gate codes, parking, etc.">
              <textarea rows={3} className={inputClass()} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </Field>
            <Field label="Photo URL (optional)" hint="Link to a photo of the issue if available">
              <input placeholder="https://..." className={inputClass()} value={form.photoUrl} onChange={(e) => update("photoUrl", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      {previewQuotes.length > 0 && step === 2 && (
        <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-white font-bold flex items-center gap-2"><Gauge className="w-4 h-4 text-orange-500" /> Indicative Callout Price</div>
            <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full font-semibold">Indicative</span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Select a supplier to proceed with. Names appear once they confirm your booking.</p>
          <div className="space-y-2 mb-1">
            {previewQuotes.map((pq, idx) => {
              const selected = form.selectedSupplierId === pq.supplierId;
              return (
                <button
                  type="button"
                  key={pq.supplierId}
                  onClick={() => update("selectedSupplierId", pq.supplierId)}
                  className={`w-full rounded-lg px-4 py-3 border transition-colors ${
                    selected ? "border-orange-500 bg-orange-500/10" : "border-transparent bg-black/30 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${selected ? "text-orange-500" : "text-neutral-400"}`}>
                      {selected && "✓ "}Supplier {idx + 1}
                    </span>
                    <span className={`text-lg font-extrabold ${selected ? "text-orange-500" : "text-white"}`}>${pq.est.low} – ${pq.est.high}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
                    <span>Callout ${pq.est.calloutFee} + Travel ${pq.est.travelCharge} + Labour ${pq.est.labour} ({pq.est.labourHours}h @ ${pq.est.hourlyRate}/hr)</span>
                  </div>
                </button>
              );
            })}
          </div>
          {errors.selectedSupplierId && <p className="text-xs text-red-400 mt-2">{errors.selectedSupplierId}</p>}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={back} disabled={step === 1} className="flex items-center gap-2 px-5 py-3 rounded-lg border border-neutral-700 text-neutral-300 disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < 3 ? (
          <button onClick={next} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={submit} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors">
            Send Booking Request <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function SupplierAuth({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sendLink = async () => {
    const addr = email.trim();
    if (!addr) return;
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/supplier` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="max-w-sm mx-auto">
      {onBack && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-6 h-6 text-orange-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">
          {sent ? "Check your email" : "Supplier Portal"}
        </h1>
        <p className="text-neutral-400 text-sm">
          {sent
            ? `We sent a sign-in link to ${email.trim()}.`
            : "Sign in with the email on your supplier account."}
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {sent ? (
        <button onClick={() => { setSent(false); setErr(""); }} className="w-full text-sm text-neutral-400 hover:text-white">
          Use a different email
        </button>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <Field label="Email" required>
            <input
              type="email"
              autoFocus
              placeholder="you@company.com"
              className={inputClass()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
            />
          </Field>
          <button
            onClick={sendLink}
            disabled={busy || !email.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold py-3 rounded-lg transition-colors"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </div>
      )}
    </div>
  );
}

function SupplierNotLinked({ email, onSignOut }) {
  return (
    <div className="max-w-sm mx-auto text-center">
      <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-6 h-6 text-orange-500" />
      </div>
      <h1 className="text-2xl font-extrabold text-white mb-1">Account not linked</h1>
      <p className="text-neutral-400 text-sm mb-6">
        <span className="text-neutral-300">{email}</span> isn't attached to a
        supplier account yet. Ask the operator to set this as the contact email
        on your supplier record, then sign in again.
      </p>
      <button onClick={onSignOut} className="text-sm text-neutral-400 hover:text-white">
        Sign out
      </button>
    </div>
  );
}

/* ---------- NEW: unified Jobs tab replacing Requests + My Quotes ---------- */

function SupplierPortal({ supplier, onLogout, requests, quotes, connections, pricing, onSavePricing, onSubmitManualQuote, onUnlock, onConfirmQuote, onRejectQuote, onUpdateFieldService, onMarkComplete }) {
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

function AdminPortal({
  onLogout, suppliers, pricingBySupplier, requests, quotes, connections,
  onSavePricing, onSubmitManualQuote, onUnlock, onConfirmQuote, onRejectQuote, onUpdateFieldService, onMarkComplete, onEditQuote,
  onAddSupplier, onUpdateSupplier, onDeleteSupplier,
}) {
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

function AdminSuppliers({ suppliers, pricingBySupplier, onSavePricing, onAddSupplier, onUpdateSupplier, onDeleteSupplier }) {
  const [addingOpen, setAddingOpen] = useState(false);

  return (
    <div>
      <div className="space-y-4 mb-6">
        {suppliers.map((s) => (
          <AdminSupplierRow
            key={s.id} supplier={s} pricing={pricingBySupplier[s.id]}
            onSavePricing={(next) => onSavePricing(s.id, next)}
            onUpdate={(fields) => onUpdateSupplier(s.id, fields)}
            onDelete={() => onDeleteSupplier(s.id)}
          />
        ))}
      </div>

      {addingOpen ? (
        <AdminAddSupplierForm onAdd={onAddSupplier} onDone={() => setAddingOpen(false)} />
      ) : (
        <button onClick={() => setAddingOpen(true)} className="w-full flex items-center justify-center gap-2 border border-dashed border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-400 font-semibold py-3 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add a supplier
        </button>
      )}
    </div>
  );
}

function AdminSupplierRow({ supplier, pricing, onSavePricing, onUpdate, onDelete }) {
  const [companyName, setCompanyName] = useState(supplier.companyName);
  const [passcode, setPasscode] = useState(supplier.passcode);
  const [serviceArea, setServiceArea] = useState(supplier.serviceArea || "");
  const [contactEmail, setContactEmail] = useState(supplier.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(supplier.contactPhone || "");
  const [savedMsg, setSavedMsg] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);

  const save = async () => {
    await onUpdate({ companyName, passcode, serviceArea, contactEmail, contactPhone });
    setSavedMsg("Saved");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const remove = () => {
    if (window.confirm(`Remove ${supplier.companyName}? Their existing quotes and requests will stay on record but will show as an unknown supplier.`)) {
      onDelete();
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Company name">
          <input className={inputClass()} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </Field>
        <Field label="Passcode">
          <input className={inputClass()} value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </Field>
        <Field label="Service area" hint="Blank = all areas">
          <input className={inputClass()} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass()} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
        <Field label="Contact email">
          <input className={inputClass()} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={save} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors">Save</button>
        {savedMsg && <span className="text-xs text-emerald-400 font-semibold">{savedMsg}</span>}
        <button onClick={() => setPricingOpen((o) => !o)} className="border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 px-4 py-2 rounded-lg text-sm transition-colors">
          {pricingOpen ? "Hide pricing" : "Edit pricing"}
        </button>
        <button onClick={remove} className="ml-auto border border-neutral-700 hover:border-red-500 hover:text-red-400 text-neutral-400 px-4 py-2 rounded-lg text-sm transition-colors">Remove</button>
      </div>
      {pricingOpen && (
        <div className="mt-4 border-t border-neutral-800 pt-4">
          <PricingAdmin pricing={pricing} onSave={onSavePricing} />
        </div>
      )}
    </div>
  );
}

function AdminAddSupplierForm({ onAdd, onDone }) {
  const [companyName, setCompanyName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!companyName || !passcode) return;
    setSaving(true);
    await onAdd(companyName, passcode, serviceArea, contactEmail, contactPhone);
    setSaving(false);
    onDone();
  };

  return (
    <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-5">
      <div className="text-white font-bold mb-3">New supplier</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Company name" required>
          <input className={inputClass()} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </Field>
        <Field label="Passcode" required>
          <input className={inputClass()} value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </Field>
        <Field label="Service area" hint="Blank = all areas">
          <input className={inputClass()} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass()} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
        <Field label="Contact email">
          <input className={inputClass()} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || !companyName || !passcode} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50">
          {saving ? "Adding..." : "Add supplier"}
        </button>
        <button onClick={onDone} className="px-4 border border-neutral-700 text-neutral-300 rounded-lg text-sm">Cancel</button>
      </div>
    </div>
  );
}

function JobQuoteCard({ q, req, unlocked, pricing, onConfirmQuote, onRejectQuote, onUpdateFieldService, onUnlock, onMarkComplete, onEditQuote }) {
  const [editing, setEditing] = useState(false);
  const isCompleted = q.status === "completed";
  const isAccepted = q.status === "accepted" || isCompleted;
  // A job can be marked complete once it's confirmed, even if the customer never
  // explicitly clicked "Accept" — don't make completion depend on that extra step.
  const canComplete = (q.status === "confirmed" || q.status === "accepted") && !isCompleted;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-orange-500 font-mono text-sm">{q.requestId}</span>
        <div className="flex items-center gap-2">
          <Badge tone={q.quoteType === "auto" ? "neutral" : "amber"}>{q.quoteType}</Badge>
          <Badge tone={isCompleted ? "green" : isAccepted ? "orange" : "neutral"}>{q.status}</Badge>
        </div>
      </div>

      {q.isBooking ? (
        <div className="bg-black/30 rounded-lg p-3 space-y-2 mb-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Callout fee</span>
            <span className="text-white font-semibold">${q.calloutFee}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Travel charge</span>
            <span className="text-white font-semibold">${q.travelCharge}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-300">Labour{q.labourHours ? ` (${q.labourHours}h @ $${q.hourlyRate}/hr)` : ""}</span>
            <span className="text-white font-semibold">${q.labour}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
            <span className="text-sm font-bold text-orange-500">Total</span>
            <span className="text-lg font-extrabold text-orange-500">${q.priceLow} – ${q.priceHigh}</span>
          </div>
        </div>
      ) : (() => {
        const ct = combinedTotal(q);
        const showBreakdown = ct.hasOnSite && q.fieldService?.status !== "pending";
        if (!showBreakdown) {
          return <div className="text-white font-bold text-lg mb-1">${ct.low} – ${ct.high}</div>;
        }
        return (
          <div className="bg-black/30 rounded-lg p-3 space-y-2 mb-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-300">Hose assembly</span>
              <span className="text-white font-semibold">${q.priceLow} – ${q.priceHigh}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-300">On-site callout &amp; travel</span>
              <span className="text-white font-semibold">${q.fieldService.calloutFee + q.fieldService.travelCharge}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
              <span className="text-sm font-bold text-orange-500">Total</span>
              <span className="text-lg font-extrabold text-orange-500">${ct.low} – ${ct.high}</span>
            </div>
          </div>
        );
      })()}

      {req && (q.isBooking ? <BookingSpec r={req} /> : <ManufacturingSpec r={req} compact />)}

      {q.status === "confirmed" && !q.isBooking && q.fieldService?.requested && (
        <SupplierFieldServiceReview quote={q} pricing={pricing} onUpdate={onUpdateFieldService} />
      )}

      {isAccepted && !isCompleted && (
        unlocked ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-sm mt-3">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1"><Unlock className="w-3.5 h-3.5" /> Contact unlocked</div>
            <div className="text-white">{req?.name}</div>
            <div className="text-neutral-400">{req?.phone} {req?.phone && req?.email && "·"} {req?.email}</div>
          </div>
        ) : (
          <button onClick={() => onUnlock(q.id)} className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors mt-3">
            <Lock className="w-4 h-4" /> Unlock Contact Details
          </button>
        )
      )}

      {canComplete && (
        <button onClick={() => onMarkComplete(q.id)} className="w-full flex items-center justify-center gap-2 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400 font-bold py-2.5 rounded-lg transition-colors mt-2">
          <CheckCircle2 className="w-4 h-4" /> Mark as complete
        </button>
      )}

      {onEditQuote && !isCompleted && (
        <div className="mt-2">
          <button onClick={() => setEditing((e) => !e)} className="w-full flex items-center justify-center gap-2 border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 font-semibold py-2.5 rounded-lg text-sm transition-colors">
            <Settings className="w-3.5 h-3.5" /> {editing ? "Hide pricing editor" : "Edit pricing (Admin)"}
          </button>
          {editing && <ActiveQuoteEditor quote={q} onSave={(overrides) => { onEditQuote(q.id, overrides); setEditing(false); }} />}
        </div>
      )}

      {isCompleted && (
        <div className="mt-3 text-xs text-neutral-500 border-t border-neutral-800 pt-3">
          Completed {q.completedAt ? new Date(q.completedAt).toLocaleDateString() : ""}
        </div>
      )}
    </div>
  );
}

function ActiveQuoteEditor({ quote, onSave }) {
  const [priceLow, setPriceLow] = useState(quote.priceLow ?? 0);
  const [priceHigh, setPriceHigh] = useState(quote.priceHigh ?? 0);
  const [leadTime, setLeadTime] = useState(quote.leadTimeDays ?? 3);
  const [calloutFee, setCalloutFee] = useState(quote.calloutFee ?? quote.fieldService?.calloutFee ?? 65);
  const [travelCharge, setTravelCharge] = useState(quote.travelCharge ?? quote.fieldService?.travelCharge ?? 45);
  const [labour, setLabour] = useState(quote.labour ?? quote.fieldService?.labour ?? 0);

  const showOnSiteFields = quote.isBooking || (quote.fieldService && quote.fieldService.requested);

  const save = () => {
    const overrides = {
      priceLow: parseFloat(priceLow) || 0,
      priceHigh: parseFloat(priceHigh) || 0,
      leadTimeDays: parseInt(leadTime) || 1,
    };
    if (quote.isBooking) {
      overrides.calloutFee = parseFloat(calloutFee) || 0;
      overrides.travelCharge = parseFloat(travelCharge) || 0;
      overrides.labour = parseFloat(labour) || 0;
    } else if (quote.fieldService && quote.fieldService.requested) {
      overrides.fieldService = { ...quote.fieldService, calloutFee: parseFloat(calloutFee) || 0, travelCharge: parseFloat(travelCharge) || 0, labour: parseFloat(labour) || 0 };
    }
    onSave(overrides);
  };

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">{quote.isBooking ? "Total low $" : "Hose low $"}</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={priceLow} onChange={(e) => setPriceLow(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">{quote.isBooking ? "Total high $" : "Hose high $"}</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} />
        </div>
      </div>
      {showOnSiteFields && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Callout $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={calloutFee} onChange={(e) => setCalloutFee(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Travel $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travelCharge} onChange={(e) => setTravelCharge(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Labour $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labour} onChange={(e) => setLabour(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
        <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
      </div>
      <button onClick={save} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors">Save changes</button>
    </div>
  );
}

function BookingSpec({ r }) {
  return (
    <div className="bg-black/30 rounded-lg p-3 text-sm space-y-2 mb-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
        <div><span className="text-neutral-500">Equipment:</span> {r.equipmentType}</div>
        <div><span className="text-neutral-500">Issue:</span> {r.issue}</div>
        <div><span className="text-neutral-500">Priority:</span> {URGENCY.find((u) => u.key === r.urgency)?.label}</div>
        <div className="col-span-2"><span className="text-neutral-500">Location:</span> {r.location}</div>
      </div>
      {r.description && <div className="text-neutral-300 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Details:</span> {r.description}</div>}
      {r.labourHoursEstimate && <div className="text-orange-400 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Customer's time estimate:</span> {r.labourHoursEstimate} hour{parseFloat(r.labourHoursEstimate) !== 1 ? "s" : ""}</div>}
      {r.notes && <div className="text-neutral-300 pt-1 border-t border-neutral-800"><span className="text-neutral-500">Notes:</span> {r.notes}</div>}
      {r.photoUrl && <div className="text-neutral-300"><span className="text-neutral-500">Photo:</span> <span className="text-orange-500 underline break-all">{r.photoUrl}</span></div>}
    </div>
  );
}

function AssemblyPriceBreakdown({ r, pricing }) {
  if (!pricing) return null;
  const est = calcEstimate(r, pricing);
  if (!est || !est.assemblyBreakdown.length) return null;
  return (
    <div className="bg-black/30 rounded-lg p-3 text-sm mb-3">
      <div className="text-neutral-500 text-xs font-semibold uppercase tracking-wide mb-2">Assembly Pricing (your rates)</div>
      <div className="space-y-1.5">
        {est.assemblyBreakdown.map((ab) => (
          <div key={ab.index} className="flex items-center justify-between">
            <span className="text-neutral-300">Assembly {ab.index + 1} — {ab.hoseType} · {ab.bore?.replace(/_/g, "/")}" · {ab.length}m × {ab.quantity}</span>
            <span className="text-white font-semibold whitespace-nowrap ml-3">${Math.round(ab.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-700">
        <span className="text-neutral-400 text-xs">+ Labour ${Math.round(est.labour)}, Crimp ${Math.round(est.crimp)}, Travel ${Math.round(est.travel)}{est.callout ? `, Callout $${Math.round(est.callout)}` : ""}</span>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-bold text-orange-500">Total</span>
        <span className="font-extrabold text-orange-500">${est.low} – ${est.high}</span>
      </div>
    </div>
  );
}

function ManufacturingSpec({ r, compact }) {
  const assemblies = r.assemblies || [];
  return (
    <div className={`bg-black/30 rounded-lg p-3 text-sm space-y-2 ${compact ? "mb-3" : "mb-3"}`}>
      {assemblies.map((a, idx) => (
        <div key={a.id || idx} className={idx > 0 ? "pt-2 border-t border-neutral-800" : ""}>
          {assemblies.length > 1 && <div className="text-orange-500 text-xs font-bold mb-1">ASSEMBLY {idx + 1}</div>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300">
            <div><span className="text-neutral-500">Category:</span> {a.category === "hydraulic_oil" ? "Hydraulic Oil" : "Pressure Washer"}</div>
            <div><span className="text-neutral-500">Hose type:</span> {a.hoseType}</div>
            <div><span className="text-neutral-500">Bore:</span> {a.bore?.replace(/_/g, "/")}"</div>
            <div><span className="text-neutral-500">Length:</span> {a.length}m × {a.quantity}</div>
            <div className="col-span-2"><span className="text-neutral-500">Pressure:</span> {a.pressure} PSI</div>
          </div>
          <div className="mt-1.5 space-y-1 text-neutral-300">
            <div><span className="text-neutral-500">Fitting A:</span> {a.fittingAType} ({a.fittingAOrientation})</div>
            <div><span className="text-neutral-500">Fitting B:</span> {a.fittingBType} ({a.fittingBOrientation})</div>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-300 pt-2 border-t border-neutral-800">
        <div><span className="text-neutral-500">Urgency:</span> {URGENCY.find((u) => u.key === r.urgency)?.label}</div>
        <div className="col-span-2"><span className="text-neutral-500">Location:</span> {r.location}</div>
      </div>
      {r.notes && <div className="text-neutral-300 pt-1 border-t border-neutral-800 mt-1"><span className="text-neutral-500">Notes:</span> {r.notes}</div>}
      {r.photoUrl && <div className="text-neutral-300"><span className="text-neutral-500">Photo:</span> <span className="text-orange-500 underline break-all">{r.photoUrl}</span></div>}
      {r.fieldServiceRequested && (
        <div className="text-orange-400 pt-1 border-t border-neutral-800 mt-1">
          <span className="text-neutral-500">On-site service requested:</span> {r.siteAddress}{r.accessNotes ? ` — ${r.accessNotes}` : ""}
        </div>
      )}
    </div>
  );
}

function SupplierFieldServiceReview({ quote, pricing, onUpdate }) {
  const fs = quote.fieldService;
  const [callout, setCallout] = useState(fs.calloutFee);
  const [travel, setTravel] = useState(fs.travelCharge);
  const [labourHours, setLabourHours] = useState(fs.customerLabourHours || 1);
  const [hourlyRate, setHourlyRate] = useState(pricing?.labourHourlyRate ?? 85);

  const labour = Math.round((parseFloat(labourHours) || 0) * (parseFloat(hourlyRate) || 0));

  if (fs.status === "quoted" || fs.status === "confirmed") {
    return (
      <div className="border border-neutral-800 rounded-lg p-3 mt-3 text-sm">
        <div className="text-white font-semibold mb-1">On-site service — {fs.status === "confirmed" ? "confirmed by customer" : "sent to customer"}</div>
        <div className="text-neutral-400">{fs.siteAddress} — included in total above</div>
      </div>
    );
  }

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mt-3 space-y-3">
      <div className="text-white font-semibold text-sm">On-site service requested</div>
      <div className="text-sm text-neutral-400">{fs.siteAddress}</div>
      {fs.accessNotes && <div className="text-sm text-neutral-500">{fs.accessNotes}</div>}
      {fs.customerLabourHours && (
        <div className="text-xs text-orange-400 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
          Customer's own time estimate: {fs.customerLabourHours} hour{parseFloat(fs.customerLabourHours) !== 1 ? "s" : ""} — adjust hours and rate below to set the actual cost.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Callout fee $</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={callout} onChange={(e) => setCallout(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Travel charge $</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travel} onChange={(e) => setTravel(e.target.value)} />
        </div>
      </div>
      <div className="border border-neutral-700 rounded-lg p-2.5">
        <label className="text-xs text-neutral-500 block mb-1.5">Labour</label>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Hours</label>
            <input type="number" step="0.5" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labourHours} onChange={(e) => setLabourHours(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-600 block mb-1">$ / hour</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </div>
          <div className="text-center pb-2">
            <div className="text-xs text-neutral-600 mb-1">= Labour $</div>
            <div className="text-white font-bold">${labour}</div>
          </div>
        </div>
      </div>
      <button
        onClick={() => onUpdate(quote.id, parseFloat(callout) || fs.calloutFee, parseFloat(travel) || fs.travelCharge, labourHours, hourlyRate)}
        className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors"
      >
        Send to customer
      </button>
    </div>
  );
}

function AutoQuoteReview({ quote, onConfirmQuote, onRejectQuote }) {
  const [priceLow, setPriceLow] = useState(quote.priceLow ?? 0);
  const [priceHigh, setPriceHigh] = useState(quote.priceHigh ?? 0);
  const [leadTime, setLeadTime] = useState(quote.leadTimeDays ?? 3);
  const [calloutFee, setCalloutFee] = useState(quote.calloutFee ?? 65);
  const [travelCharge, setTravelCharge] = useState(quote.travelCharge ?? 45);
  const [labourHours, setLabourHours] = useState(quote.customerLabourHours || 1);
  const [hourlyRate, setHourlyRate] = useState(85);

  if (quote.isBooking) {
    const labour = Math.round((parseFloat(labourHours) || 0) * (parseFloat(hourlyRate) || 0));
    const total = (parseFloat(calloutFee) || 0) + (parseFloat(travelCharge) || 0) + labour;
    const confirm = () => {
      onConfirmQuote(quote.id, {
        calloutFee: parseFloat(calloutFee) || 0,
        travelCharge: parseFloat(travelCharge) || 0,
        labour,
        priceLow: total,
        priceHigh: total,
        leadTimeDays: parseInt(leadTime) || 1,
      });
    };
    return (
      <div className="space-y-3 mt-1">
        <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">Review pricing before sending to customer</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Callout fee $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={calloutFee} onChange={(e) => setCalloutFee(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Travel charge $</label>
            <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={travelCharge} onChange={(e) => setTravelCharge(e.target.value)} />
          </div>
        </div>
        <div className="border border-neutral-700 rounded-lg p-2.5">
          <label className="text-xs text-neutral-500 block mb-1.5">Labour</label>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Hours</label>
              <input type="number" step="0.5" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={labourHours} onChange={(e) => setLabourHours(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-600 block mb-1">$ / hour</label>
              <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </div>
            <div className="text-center pb-2">
              <div className="text-xs text-neutral-600 mb-1">= Labour $</div>
              <div className="text-white font-bold">${labour}</div>
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
          <input type="number" className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-white text-sm" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
          <span className="text-sm font-bold text-orange-500">Total to customer</span>
          <span className="text-lg font-extrabold text-orange-500">${total}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={confirm} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">Confirm &amp; send to customer</button>
          <button onClick={() => onRejectQuote(quote.id)} className="flex-1 border border-neutral-700 hover:border-red-500 hover:text-red-400 text-neutral-300 py-2.5 rounded-lg transition-colors">Reject</button>
        </div>
      </div>
    );
  }

  const confirm = () => {
    onConfirmQuote(quote.id, {
      priceLow: parseFloat(priceLow) || 0,
      priceHigh: parseFloat(priceHigh) || 0,
      leadTimeDays: parseInt(leadTime) || 1,
    });
  };

  return (
    <div className="space-y-3 mt-1">
      <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">Review pricing before sending to customer</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Low $</label>
          <input type="number" className={inputClass()} value={priceLow} onChange={(e) => setPriceLow(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">High $</label>
          <input type="number" className={inputClass()} value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Lead time (days)</label>
        <input type="number" className={inputClass()} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button onClick={confirm} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors">Confirm &amp; send to customer</button>
        <button onClick={() => onRejectQuote(quote.id)} className="flex-1 border border-neutral-700 hover:border-red-500 hover:text-red-400 text-neutral-300 py-2.5 rounded-lg transition-colors">Reject</button>
      </div>
    </div>
  );
}

function RequestCard({ r, myQuote, pricing, onSubmitManualQuote, onConfirmQuote, onRejectQuote }) {
  const [showForm, setShowForm] = useState(false);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [lead, setLead] = useState(3);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-orange-500 font-mono text-sm">{r.id}</span>
        <Badge tone={r.urgency === "emergency" ? "red" : r.urgency === "priority" ? "amber" : "neutral"}>{URGENCY.find((u) => u.key === r.urgency)?.label}</Badge>
      </div>
      <div className="text-white font-semibold mb-2">
        {r.requestType === "booking" ? `${r.equipmentType} — ${r.issue}` : (r.assemblies?.length > 1 ? `${r.assemblies.length} hose assemblies` : r.assemblies?.[0]?.hoseType)}
      </div>
      {r.requestType === "booking" ? <BookingSpec r={r} /> : <ManufacturingSpec r={r} />}
      {r.requestType !== "booking" && <AssemblyPriceBreakdown r={r} pricing={pricing} />}

      {myQuote ? (
        myQuote.status === "pending" && myQuote.quoteType === "auto" ? (
          <AutoQuoteReview quote={myQuote} onConfirmQuote={onConfirmQuote} onRejectQuote={onRejectQuote} />
        ) : (
          <div className="text-sm text-emerald-400 font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Quoted: ${myQuote.priceLow} – ${myQuote.priceHigh} ({myQuote.quoteType})</div>
        )
      ) : showForm ? (
        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Low $" className={inputClass()} value={low} onChange={(e) => setLow(e.target.value)} />
            <input type="number" placeholder="High $" className={inputClass()} value={high} onChange={(e) => setHigh(e.target.value)} />
          </div>
          <input type="number" placeholder="Lead time (days)" className={inputClass()} value={lead} onChange={(e) => setLead(e.target.value)} />
          <button
            onClick={() => { if (low && high) { onSubmitManualQuote(r.id, parseFloat(low), parseFloat(high), parseInt(lead) || 1); setShowForm(false); } }}
            className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors"
          >
            Submit quote
          </button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="text-sm border border-neutral-700 hover:border-orange-500 hover:text-white text-neutral-300 px-4 py-2 rounded-lg transition-colors">
          Submit manual quote
        </button>
      )}
    </div>
  );
}

function Badge({ tone, children }) {
  const tones = {
    red: "bg-red-500/15 text-red-400",
    amber: "bg-amber-500/15 text-amber-400",
    neutral: "bg-neutral-700 text-neutral-300",
    orange: "bg-orange-500/15 text-orange-400",
    green: "bg-emerald-500/15 text-emerald-400",
  };
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tones[tone]}`}>{children}</span>;
}

function PricingAdmin({ pricing, onSave }) {
  const [local, setLocal] = useState(pricing);
  const [saving, setSaving] = useState(false);
  useEffect(() => setLocal(pricing), [pricing]);

  const updateItem = (group, key, field, value) => {
    setLocal((p) => ({ ...p, [group]: { ...p[group], [key]: { ...p[group][key], [field]: field === "price" ? (parseFloat(value) || 0) : value } } }));
  };

  const addItem = (group, label, price, partNumber) => {
    const key = slugify(label);
    setLocal((p) => ({ ...p, [group]: { ...p[group], [key]: { label, price: parseFloat(price) || 0, partNumber: partNumber || "" } } }));
  };

  const save = async () => { setSaving(true); await onSave(local); setSaving(false); };

  if (!local) return null;

  return (
    <div>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
        <div className="text-white font-bold mb-3">Base Rates</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Labour Rate ($ / job)">
            <input type="number" className={inputClass()} value={local.labourBase} onChange={(e) => setLocal((p) => ({ ...p, labourBase: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Crimp Charge ($ / fitting)">
            <input type="number" className={inputClass()} value={local.crimpCharge} onChange={(e) => setLocal((p) => ({ ...p, crimpCharge: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Travel Rate ($ base)">
            <input type="number" className={inputClass()} value={local.travelBase} onChange={(e) => setLocal((p) => ({ ...p, travelBase: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Callout Fee ($ default, on-site jobs)">
            <input type="number" className={inputClass()} value={local.calloutFee ?? 65} onChange={(e) => setLocal((p) => ({ ...p, calloutFee: parseFloat(e.target.value) || 0 }))} />
          </Field>
          <Field label="Labour Hourly Rate ($ / hour, field service)">
            <input type="number" className={inputClass()} value={local.labourHourlyRate ?? 85} onChange={(e) => setLocal((p) => ({ ...p, labourHourlyRate: parseFloat(e.target.value) || 0 }))} />
          </Field>
        </div>
      </div>

      <PricingGroup title="Hose Pricing (per metre)" data={local.hose} onChange={(k, f, v) => updateItem("hose", k, f, v)} onAdd={(label, price, part) => addItem("hose", label, price, part)} addLabel="Add hose type" />
      <PricingGroup title="Fitting Pricing (per item)" data={local.fitting} onChange={(k, f, v) => updateItem("fitting", k, f, v)} onAdd={(label, price, part) => addItem("fitting", label, price, part)} addLabel="Add fitting type" />

      <button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}

function PricingGroup({ title, data, onChange, onAdd, addLabel }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newPart, setNewPart] = useState("");

  const submitAdd = () => {
    if (!newLabel || !newPrice) return;
    onAdd(newLabel, newPrice, newPart);
    setNewLabel(""); setNewPrice(""); setNewPart(""); setAdding(false);
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white font-bold">{title}</div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-400">
            <Plus className="w-3.5 h-3.5" /> {addLabel}
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-black/40 border border-neutral-800 rounded-lg p-3 mb-3 space-y-2">
          <input placeholder="Label (e.g. 6-wire spiral SAE 100R15)" className={inputClass()} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Price ($)" className={inputClass()} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <input placeholder="Part number" className={inputClass()} value={newPart} onChange={(e) => setNewPart(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={submitAdd} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 rounded-lg text-sm transition-colors">Add</button>
            <button onClick={() => setAdding(false)} className="flex-1 border border-neutral-700 text-neutral-300 py-2 rounded-lg text-sm transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-neutral-800">
        {Object.entries(data).map(([key, item]) => (
          <div key={key} className="py-3">
            <input
              className="w-full bg-neutral-800 border border-neutral-700 focus:border-orange-500 rounded-lg text-white text-sm font-medium mb-2 px-3 py-2 outline-none transition-colors"
              value={item.label}
              onChange={(e) => onChange(key, "label", e.target.value)}
            />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-500 text-xs whitespace-nowrap">Part #</span>
                <input placeholder="—" className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-sm" value={item.partNumber || ""} onChange={(e) => onChange(key, "partNumber", e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">$</span>
                <input type="number" step="0.5" className="w-20 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-white text-right" value={item.price} onChange={(e) => onChange(key, "price", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
