// Supabase row <-> app-shape mapping. Pure, extracted verbatim from App.tsx.

export function supplierFromRow(r) {
  return { id: r.id, companyName: r.company_name, serviceArea: r.service_area || "", contactEmail: r.contact_email, contactPhone: r.contact_phone, createdAt: r.created_at };
}
export function pricingFromRow(r) {
  return { hose: r.hose || {}, fitting: r.fitting || {}, labourBase: r.labour_base, crimpCharge: r.crimp_charge, travelBase: r.travel_base, calloutFee: r.callout_fee, labourHourlyRate: r.labour_hourly_rate, deliveryFee: r.delivery_fee };
}
export function requestFromRow(r) {
  return {
    id: r.id, requestType: r.request_type, status: r.status, selectedSupplierId: r.selected_supplier_id,
    accessToken: r.access_token,
    urgency: r.urgency, location: r.location, fieldServiceRequested: r.field_service_requested,
    siteAddress: r.site_address, accessNotes: r.access_notes, fsLabourHoursEstimate: r.fs_labour_hours_estimate,
    fulfillment: r.fulfillment, deliveryAddress: r.delivery_address, deliveryNotes: r.delivery_notes,
    name: r.name, phone: r.phone, email: r.email, preferredTime: r.preferred_time, notes: r.notes, photoUrl: r.photo_url,
    assemblies: r.assemblies || [], equipmentType: r.equipment_type, issue: r.issue, description: r.description,
    labourHoursEstimate: r.labour_hours_estimate, createdAt: r.created_at,
  };
}
export function quoteFromRow(r) {
  return {
    id: r.id, requestId: r.request_id, supplierId: r.supplier_id, isBooking: r.is_booking,
    priceLow: r.price_low, priceHigh: r.price_high, leadTimeDays: r.lead_time_days, quoteType: r.quote_type,
    status: r.status, calloutFee: r.callout_fee, travelCharge: r.travel_charge, labour: r.labour,
    hoseAssemblyCost: r.hose_assembly_cost, deliveryCharge: r.delivery_charge, customerLabourHours: r.customer_labour_hours,
    fieldService: r.field_service, createdAt: r.created_at, completedAt: r.completed_at,
  };
}
export function connectionFromRow(r) {
  return { id: r.id, quoteId: r.quote_id, unlocked: r.unlocked, unlockedAt: r.unlocked_at };
}
