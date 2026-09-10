// The admin "Suppliers" tab: list of editable supplier rows + an add form.
// Extracted verbatim from App.tsx. AdminSuppliers is the only export;
// AdminSupplierRow and AdminAddSupplierForm are used only by it.

import { useState } from "react";
import { Plus } from "lucide-react";
import { Field, inputClass } from "./ui";
import { PricingAdmin } from "./PricingAdmin";

export function AdminSuppliers({ suppliers, pricingBySupplier, onSavePricing, onAddSupplier, onUpdateSupplier, onDeleteSupplier }: any) {
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

function AdminSupplierRow({ supplier, pricing, onSavePricing, onUpdate, onDelete }: any) {
  const [companyName, setCompanyName] = useState(supplier.companyName);
  const [serviceArea, setServiceArea] = useState(supplier.serviceArea || "");
  const [contactEmail, setContactEmail] = useState(supplier.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(supplier.contactPhone || "");
  const [savedMsg, setSavedMsg] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);

  const save = async () => {
    await onUpdate({ companyName, serviceArea, contactEmail, contactPhone });
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
        <Field label="Service area" hint="Blank = all areas">
          <input className={inputClass()} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass()} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
        <Field label="Contact email" hint="Used for the supplier's magic-link login">
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

function AdminAddSupplierForm({ onAdd, onDone }: any) {
  const [companyName, setCompanyName] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!companyName || !contactEmail) return;
    setSaving(true);
    await onAdd(companyName, serviceArea, contactEmail, contactPhone);
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
        <Field label="Contact email" required hint="The supplier signs in with a magic link to this address">
          <input className={inputClass()} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </Field>
        <Field label="Service area" hint="Blank = all areas">
          <input className={inputClass()} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass()} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || !companyName || !contactEmail} className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50">
          {saving ? "Adding..." : "Add supplier"}
        </button>
        <button onClick={onDone} className="px-4 border border-neutral-700 text-neutral-300 rounded-lg text-sm">Cancel</button>
      </div>
    </div>
  );
}
