// Blank form / assembly factories. Pure, extracted verbatim from App.tsx.

export function emptyAssembly() {
  return {
    id: `asm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: "hydraulic_oil", hoseType: "", bore: "", length: "", quantity: 1, pressure: "",
    fittingAType: "", fittingAOrientation: "Straight", fittingBType: "", fittingBOrientation: "Straight",
  };
}

export function emptyForm() {
  return {
    assemblies: [emptyAssembly()],
    urgency: "standard", location: "", selectedSupplierId: "",
    fieldServiceRequested: false, siteAddress: "", accessNotes: "", fsLabourHoursEstimate: "",
    fulfillment: "pickup", deliveryAddress: "", deliveryNotes: "",
    name: "", phone: "", email: "", preferredTime: "", notes: "", photoUrl: "",
  };
}

export function emptyBookingForm() {
  return {
    equipmentType: "", issue: "", description: "", labourHoursEstimate: "",
    urgency: "standard", location: "", selectedSupplierId: "",
    name: "", phone: "", email: "", preferredTime: "", notes: "", photoUrl: "",
  };
}
