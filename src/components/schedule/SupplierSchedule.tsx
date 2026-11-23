// The supplier "Schedule" tab: working days and hours, days off, and booking
// rules. Customers will book 2-hour slots inside these hours; anything outside
// is an after-hours callout with the extra fee set in Pricing. A supplier edits
// their own; an admin picks a supplier first (AdminSchedule).

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DAY_NAMES, SLOT_HOURS, defaultSchedule, formatHour, leftoverHours, loadSchedule, saveSchedule,
  scheduleProblem, slotsForHours, weekdayIndex, dateKey, type Schedule,
} from "../../lib/schedule";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const START_HOURS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const END_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

const card = "bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6";
const select = "bg-neutral-950 border border-neutral-700 rounded-lg px-1.5 sm:px-2 py-1.5 text-white text-sm outline-none focus:border-orange-500";

const fmtDollars = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Options always include the current value, even if it isn't a standard choice.
function withCurrent(values: number[], current: number): number[] {
  return values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
}

export function SupplierSchedule({ supplierId, afterHoursFee }: { supplierId: string; afterHoursFee?: number }) {
  const [saved, setSaved] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [today] = useState(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; });
  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));

  useEffect(() => {
    let cancelled = false;
    loadSchedule(supplierId)
      .then((s) => { if (!cancelled) { setSaved(s); setDraft(s); } })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [supplierId]);

  const dirty = useMemo(() => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  if (loadError) return <p className="text-red-400 text-sm">Couldn't load the schedule: {loadError}</p>;
  if (!draft) return <p className="text-neutral-500">Loading…</p>;

  const set = (patch: Partial<Schedule>) => { setDraft({ ...draft, ...patch }); setMessage(null); };
  const setDay = (i: number, patch: Partial<Schedule["hours"][number]>) => {
    const hours = draft.hours.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
    // keep every day at least one slot long: move the other end if needed
    const h = hours[i];
    if (h.end - h.start < SLOT_HOURS) {
      if ("start" in patch) h.end = Math.min(24, h.start + SLOT_HOURS);
      else h.start = Math.max(0, h.end - SLOT_HOURS);
    }
    set({ hours });
  };

  const toggleDayOff = (key: string) => {
    const off = new Set<string>(draft.daysOff);
    if (off.has(key)) off.delete(key); else off.add(key);
    set({ daysOff: Array.from(off).sort() });
  };

  const problem = scheduleProblem(draft);
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveSchedule(supplierId, draft);
      setSaved(draft);
      setMessage({ ok: true, text: "Schedule saved." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save the schedule — please try again." });
    }
    setSaving(false);
  };

  // ---- days-off calendar ----
  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const lead = weekdayIndex(first);
  const stepMonth = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div>
      <div className={card}>
        <div className="text-white font-bold mb-1">Working hours</div>
        <p className="text-neutral-500 text-sm mb-4">
          Customers can book 2-hour slots inside these hours. Anything outside them, on a day that's switched off, or on a day off is an after-hours callout.
        </p>
        {draft.hours.map((h, i) => {
          const n = slotsForHours(h).length;
          const left = leftoverHours(h);
          return (
            <div key={DAY_NAMES[i]} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5 border-b border-neutral-800 last:border-0">
              <label className="flex items-center gap-2 w-16 sm:w-24 text-white text-sm font-semibold">
                <input type="checkbox" aria-label={`${DAY_NAMES[i]} open`} checked={h.on} onChange={(e) => setDay(i, { on: e.target.checked })} className="accent-orange-500 w-4 h-4" />
                {DAY_NAMES[i]}
              </label>
              {h.on ? (
                <>
                  <select aria-label={`${DAY_NAMES[i]} start`} className={select} value={h.start} onChange={(e) => setDay(i, { start: +e.target.value })}>
                    {withCurrent(START_HOURS, h.start).map((v) => <option key={v} value={v}>{formatHour(v)}</option>)}
                  </select>
                  <span className="text-neutral-500 text-sm">to</span>
                  <select aria-label={`${DAY_NAMES[i]} finish`} className={select} value={h.end} onChange={(e) => setDay(i, { end: +e.target.value })}>
                    {withCurrent(END_HOURS, h.end).map((v) => <option key={v} value={v}>{formatHour(v)}</option>)}
                  </select>
                  <span className="text-neutral-500 text-xs basis-full sm:basis-auto pl-[72px] sm:pl-1">
                    {n} slot{n === 1 ? "" : "s"}{left ? ` · ${left} hour left over` : ""}
                  </span>
                </>
              ) : (
                <span className="text-neutral-500 text-sm">Closed — jobs are after-hours callouts</span>
              )}
            </div>
          );
        })}
      </div>

      <div className={card}>
        <div className="text-white font-bold mb-1">Days off</div>
        <p className="text-neutral-500 text-sm mb-4">Tap a day to block it (leave, public holidays). It stops being bookable in normal hours.</p>
        <div className="max-w-sm">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month" className="p-1.5 text-neutral-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-white font-semibold text-sm">{MONTHS[month.m]} {month.y}</span>
            <button type="button" onClick={() => stepMonth(1)} aria-label="Next month" className="p-1.5 text-neutral-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES.map((d) => <div key={d} className="text-[11px] text-neutral-500 py-1">{d.slice(0, 2)}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const date = new Date(month.y, month.m, i + 1);
              const key = dateKey(date);
              const off = draft.daysOff.includes(key);
              const past = date < today;
              const closed = !draft.hours[weekdayIndex(date)].on;
              return (
                <button
                  key={key} type="button" disabled={past} onClick={() => toggleDayOff(key)}
                  aria-pressed={off} aria-label={`${date.getDate()} ${MONTHS[month.m]}${off ? ", day off" : ""}`}
                  className={`h-9 rounded-md text-sm border transition-colors ${
                    off ? "bg-orange-500 border-orange-500 text-black font-semibold"
                    : past ? "border-neutral-900 text-neutral-700 cursor-default"
                    : closed ? "border-dashed border-neutral-700 text-neutral-500 hover:border-orange-500"
                    : "border-neutral-700 text-white hover:border-orange-500"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">Dashed days are already closed. {draft.daysOff.filter((k) => k >= dateKey(today)).length} upcoming day{draft.daysOff.filter((k) => k >= dateKey(today)).length === 1 ? "" : "s"} off.</p>
        </div>
      </div>

      <div className={card}>
        <div className="text-white font-bold mb-3">Booking rules</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-300 text-sm">Minimum notice before a job</span>
            <select aria-label="Minimum notice" className={select} value={draft.minNoticeHours} onChange={(e) => set({ minNoticeHours: +e.target.value })}>
              {withCurrent([0, 4, 24, 48, 72], draft.minNoticeHours).map((v) => <option key={v} value={v}>{v === 0 ? "None" : `${v} hours`}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-300 text-sm">Customers can book up to</span>
            <select aria-label="Booking horizon" className={select} value={draft.maxDaysAhead} onChange={(e) => set({ maxDaysAhead: +e.target.value })}>
              {withCurrent([14, 28, 56, 90], draft.maxDaysAhead).map((v) => <option key={v} value={v}>{v / 7 === Math.round(v / 7) ? `${v / 7} weeks ahead` : `${v} days ahead`}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-300 text-sm">Hold an unconfirmed booking for</span>
            <select aria-label="Hold time" className={select} value={draft.holdHours} onChange={(e) => set({ holdHours: +e.target.value })}>
              {withCurrent([24, 48, 72], draft.holdHours).map((v) => <option key={v} value={v}>{v} hours</option>)}
            </select>
          </div>
        </div>
        <p className="text-neutral-500 text-xs mt-4">
          After-hours callout fee: <span className="text-neutral-300 font-semibold">{afterHoursFee == null ? "set in Pricing" : fmtDollars(afterHoursFee)}</span>
          {afterHoursFee == null ? "" : " — change it in the Pricing tab"}. Times are Queensland time.
        </p>
      </div>

      {problem && <p role="alert" className="text-amber-400 text-sm mb-3">{problem}</p>}
      {message && (
        <div role={message.ok ? "status" : "alert"} className={`mb-3 rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
          {message.text}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !!problem || !dirty} className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save schedule"}
        </button>
        {dirty && !saving && <span className="text-neutral-500 text-sm">Unsaved changes</span>}
        <button type="button" onClick={() => { setDraft({ ...defaultSchedule(), daysOff: draft.daysOff }); setMessage(null); }} className="ml-auto text-sm text-neutral-500 hover:text-white">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

// Admin: choose whose schedule to edit.
export function AdminSchedule({ suppliers, pricingBySupplier }: { suppliers: any[]; pricingBySupplier: Record<string, any> }) {
  const [id, setId] = useState<string>(() => suppliers.find((s) => s.companyName === "HoseQuote")?.id ?? suppliers[0]?.id ?? "");
  if (suppliers.length === 0) return <p className="text-neutral-500">No suppliers yet.</p>;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-neutral-400 text-sm">Supplier</span>
        <select aria-label="Supplier" className={select} value={id} onChange={(e) => setId(e.target.value)}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
        </select>
      </div>
      <Fragment key={id}>
        <SupplierSchedule supplierId={id} afterHoursFee={pricingBySupplier[id]?.afterHoursFee} />
      </Fragment>
    </div>
  );
}
