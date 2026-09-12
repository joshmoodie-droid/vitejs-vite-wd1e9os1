// @ts-nocheck
// Legacy single-file app (~2900 lines) authored without types. It has 141
// pre-existing type errors, mostly inferred-`any` component props. The rest of
// src/ IS type-checked in CI — put new work in its own module rather than
// growing this file, and drop this pragma once it's broken up.
import React, { useState, useEffect, useCallback } from "react";
import { Wrench, Gauge, Settings, Droplet, MapPin, User, ChevronLeft, ChevronRight, RefreshCw, Send, Lock, Unlock, LogOut, Building2, CheckCircle2, Plus, Clock, Truck, ClipboardList, ArrowLeft } from "lucide-react";
import { supabase } from "./supabaseClient";
import { HOSE_TYPES, BORES, FITTING_TYPES, ORIENTATIONS, URGENCY, EQUIPMENT_TYPES, JOB_ISSUES } from "./lib/catalog";
import { defaultPricing, calcEstimate, combinedTotal, calcBookingEstimate } from "./lib/pricing";
import { emptyAssembly, emptyForm, emptyBookingForm } from "./lib/forms";
import { supplierFromRow, pricingFromRow, requestFromRow, quoteFromRow, connectionFromRow } from "./lib/rows";
import { areasMatch, slugify } from "./lib/util";
import { Field, inputClass, StepDot, SectionTitle, Badge } from "./components/ui";
import { BookingSpec, AssemblyPriceBreakdown, ManufacturingSpec } from "./components/specs";
import { AssemblyCard } from "./components/AssemblyCard";
import { FlowChooser } from "./components/FlowChooser";
import { CustomerAuth, SupplierAuth, SupplierNotLinked } from "./components/auth";
import { PricingAdmin } from "./components/PricingAdmin";
import { AdminSuppliers } from "./components/AdminSuppliers";
import { ActiveQuoteEditor, SupplierFieldServiceReview, AutoQuoteReview } from "./components/quoteEditors";
import { MyRequests } from "./components/MyRequests";
import { JobQuoteCard, RequestCard } from "./components/portalCards";
import { FieldServiceSection } from "./components/FieldServiceSection";
import { SupplierPortal, AdminPortal } from "./components/portals";
import { CustomerFlow, BookingFlow } from "./components/flows";

// Admin & supplier access is by Supabase Auth now (Phase 3a): admin = email in
// public.app_admin_emails; supplier = suppliers.auth_user_id linked to the
// signed-in user. See SupplierAuth.

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
    return { hose: p.hose, fitting: p.fitting, labour_base: p.labourBase, crimp_charge: p.crimpCharge, travel_base: p.travelBase, callout_fee: p.calloutFee, labour_hourly_rate: p.labourHourlyRate, delivery_fee: p.deliveryFee };
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
      if (!form.fieldServiceRequested && form.fulfillment === "delivery" && !form.deliveryAddress) e.deliveryAddress = "Enter the delivery address.";
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
      fulfillment: form.fieldServiceRequested ? "pickup" : form.fulfillment,
      delivery_address: !form.fieldServiceRequested && form.fulfillment === "delivery" ? form.deliveryAddress : null,
      delivery_notes: !form.fieldServiceRequested && form.fulfillment === "delivery" ? form.deliveryNotes : null,
      name: form.name, phone: form.phone, email: form.email, preferred_time: form.preferredTime,
      notes: form.notes, photo_url: form.photoUrl, assemblies: form.assemblies,
    };
    const { data: created } = await supabase.rpc("create_request", { r: row });
    const record = requestFromRow({ ...row, ...(created ?? { created_at: new Date().toISOString() }) });

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
    if (overrides.hoseAssemblyCost !== undefined) row.hose_assembly_cost = overrides.hoseAssemblyCost;
    if (overrides.deliveryCharge !== undefined) row.delivery_charge = overrides.deliveryCharge;
    row.status = "confirmed";
    const { error } = await supabase.from("quotes").update(row).eq("id", quoteId);
    if (error) { console.error("Confirm quote failed", error); return; }
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
    if (overrides.hoseAssemblyCost !== undefined) row.hose_assembly_cost = overrides.hoseAssemblyCost;
    if (overrides.deliveryCharge !== undefined) row.delivery_charge = overrides.deliveryCharge;
    const { error } = await supabase.from("quotes").update(row).eq("id", quoteId);
    if (error) { console.error("Edit quote failed", error); return; }
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
  const addSupplier = async (companyName, serviceArea, contactEmail, contactPhone) => {
    const row = { company_name: companyName, service_area: serviceArea || "", contact_email: contactEmail || null, contact_phone: contactPhone || null };
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
            quotes={quotes}
            onSubmitBooking={async (record, newQuote) => {
              const row = {
                id: record.id, request_type: "booking", status: "open", location: record.location,
                customer_id: customer?.id ?? null,
                urgency: record.urgency, selected_supplier_id: record.selectedSupplierId,
                name: record.name, phone: record.phone, email: record.email, preferred_time: record.preferredTime,
                notes: record.notes, photo_url: record.photoUrl, equipment_type: record.equipmentType,
                issue: record.issue, description: record.description, labour_hours_estimate: record.labourHoursEstimate,
              };
              const { data: createdReq } = await supabase.rpc("create_request", { r: row });
              setRequests((rs) => [requestFromRow({ ...row, ...(createdReq ?? { created_at: new Date().toISOString() }) }), ...rs]);
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
