// Quote / booking price estimation. Pure functions, extracted verbatim from App.tsx.

import { BORES, FITTING_TYPES, fittingBoresFor, URGENCY } from "./catalog";
import { slugify } from "./util";

// Fittings are priced per (type, bore) pair — a hose tail's size always
// matches the hose it's on, so e.g. a 3/8" BSP Female tail and a 1/2" BSP
// Female tail get separate prices. Keyed the same way pricing.hose already
// keys by `${category}_${bore}`.
export function fittingPriceKey(fittingType, boreKey) {
  return `${slugify(fittingType)}_${boreKey}`;
}

export function defaultPricing(scale = 1) {
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
  const fittingPrices = { "BSP Male": 8, "BSP Female": 9, "JIC 37° Male": 12, "JIC 37° Female": 14, "ORFS Male": 15, "ORFS Female": 17, "NPT Male": 7, "NPT Female": 8, "SAE Flange Code 61": 25, "SAE Flange Code 62": 28 };
  FITTING_TYPES.forEach((f) => {
    fittingBoresFor(f).forEach((b) => {
      fitting[fittingPriceKey(f, b.key)] = {
        label: `${f} — ${b.label}`,
        price: Math.round(fittingPrices[f] * scale),
        partNumber: "",
      };
    });
  });
  return { hose, fitting, labourBase: Math.round(15 * scale), crimpCharge: Math.round(8 * scale), travelBase: Math.round(45 * scale), calloutFee: Math.round(65 * scale), labourHourlyRate: Math.round(85 * scale), deliveryFee: Math.round(15 * scale) };
}

export function calcEstimate(form, pricing) {
  if (!pricing) return null;
  let hoseCost = 0, fittingCost = 0, fittingCount = 0, validAssemblies = 0;
  const assemblyBreakdown = [];
  form.assemblies.forEach((a, idx) => {
    const boreKey = `${a.category}_${a.bore}`;
    const hoseRule = pricing.hose[boreKey];
    if (!hoseRule || !a.length) return;
    const length = parseFloat(a.length) || 0;
    const qty = parseInt(a.quantity) || 1;
    const fittingA = pricing.fitting[fittingPriceKey(a.fittingAType, a.bore)];
    const fittingB = pricing.fitting[fittingPriceKey(a.fittingBType, a.bore)];
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
  // Delivery is a flat, supplier-set fee with nothing for the supplier to
  // confirm later (unlike the on-site callout above), so it's baked
  // straight into the total rather than tracked as a separate pending item.
  // Only relevant when the customer isn't already having a technician come
  // to them — on-site jobs don't have a separate hose assembly to hand off.
  const delivery = (!form.fieldServiceRequested && form.fulfillment === "delivery") ? (pricing.deliveryFee ?? 15) : 0;
  const total = hoseCost + fittingCost + labour + crimp + travel + delivery;
  return {
    hoseCost, fittingCost, labour, crimp, travel, callout, delivery, total, assemblyCount: validAssemblies, assemblyBreakdown,
    low: Math.round(total * 0.92), high: Math.round(total * 1.08),
  };
}

export function combinedTotal(quote) {
  const fs = quote.fieldService;
  if (!fs || !fs.requested) return { low: quote.priceLow, high: quote.priceHigh, hasOnSite: false };
  const extra = (parseFloat(fs.calloutFee) || 0) + (parseFloat(fs.travelCharge) || 0) + (parseFloat(fs.labour) || 0);
  return { low: quote.priceLow + extra, high: quote.priceHigh + extra, hasOnSite: true, extra };
}

export function calcBookingEstimate(form, pricing) {
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
