// Small pure helpers, extracted verbatim from App.tsx.

// Loose location <-> service-area match for showing a supplier in the customer flow.
export function areasMatch(requestLocation, supplierArea) {
  const loc = (requestLocation || "").trim().toLowerCase();
  const area = (supplierArea || "").trim().toLowerCase();
  if (!area || area === "all" || area === "all areas") return true;
  if (!loc) return false;
  return loc.includes(area) || area.includes(loc);
}

export function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `item_${Date.now()}`;
}
