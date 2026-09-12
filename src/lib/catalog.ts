// Hose / fitting / job option tables. Pure data, no imports.
// Extracted verbatim from App.tsx.

export const HOSE_TYPES = {
  hydraulic_oil: ["1-wire braid (SAE 100R1)", "2-wire braid (SAE 100R2)", "4-wire spiral (SAE 100R12)"],
  pressure_washer: ["2-wire braid (EN 853)", "Textile reinforced (low pressure)"],
};

export const BORES = {
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

export const FITTING_TYPES = ["BSP Male", "BSP Female", "JIC 37° Male", "JIC 37° Female", "ORFS Male", "ORFS Female", "NPT Male", "NPT Female", "SAE Flange"];

// A hose tail's size always matches the hose it's fitted to, so fittings are
// priced per (type, bore) pair rather than by type alone — e.g. a 3/8" BSP
// Female tail is priced separately from a 1/2" BSP Female tail. This is the
// same 5-size list as BORES.hydraulic_oil, kept as its own export because
// fitting sizing is a physical-diameter concept independent of hose category
// (pressure-washer hose only spans a subset of these sizes, but its fittings
// still come in all of them).
export const FITTING_BORES = [
  { key: "1_4", label: '1/4" (6mm)' },
  { key: "3_8", label: '3/8" (10mm)' },
  { key: "1_2", label: '1/2" (13mm)' },
  { key: "5_8", label: '5/8" (16mm)' },
  { key: "3_4", label: '3/4" (19mm)' },
];
export const ORIENTATIONS = ["Straight", "45° Bend", "90° Bend"];
export const URGENCY = [
  { key: "standard", label: "Standard", desc: "Normal turnaround", mult: 1 },
  { key: "priority", label: "Priority", desc: "Fast-track service", mult: 1.3 },
  { key: "emergency", label: "Emergency", desc: "Urgent / after-hours", mult: 1.6 },
];

export const EQUIPMENT_TYPES = ["Excavator", "Skid Steer / Loader", "Forklift", "Truck / Trailer", "Agricultural Equipment", "Pressure Washer", "Stationary Machinery", "Other"];
export const JOB_ISSUES = ["Hose burst / failure", "Leak", "Fitting failure", "New installation", "Routine service / inspection", "Other"];
