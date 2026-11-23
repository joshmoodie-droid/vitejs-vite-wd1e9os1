// "When do you need us?" in the field service booking form. The customer picks
// a date and one of the supplier's free 2-hour slots (business hours), or asks
// for an after-hours callout (extra fee, the supplier arranges the time). The
// slots come from the database (available_slots), so a time someone else holds
// shows as taken. All times are Queensland time.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DAY_NAMES, SCHEDULE_TIMEZONE, dateKey, formatHour, loadSlots, slotDateKey, slotHour, weekdayIndex, type Slot,
} from "../../lib/schedule";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WHEN_OPTIONS = ["As soon as possible", "Before working hours", "After working hours", "All day"];

export type WhenValue = {
  slotStart: string; // ISO timestamp of the chosen 2-hour slot, or ""
  afterHours: boolean;
  afterHoursDate: string; // YYYY-MM-DD
  afterHoursWhen: string;
};

export function SlotPicker({
  supplierId, afterHoursFee, value, onChange, onUnavailable, error,
}: {
  supplierId: string;
  afterHoursFee: number;
  value: WhenValue;
  onChange: (patch: Partial<WhenValue>) => void;
  onUnavailable: (unavailable: boolean) => void; // slots couldn't be loaded: booking continues without a time
  error?: string;
}) {
  const [today] = useState(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; });
  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string>(value.afterHoursDate || (value.slotStart ? slotDateKey(value.slotStart) : ""));

  useEffect(() => {
    const first = new Date(month.y, month.m, 1);
    const last = new Date(month.y, month.m + 1, 0);
    if (last < today) return;
    const from = first < today ? today : first;
    let cancelled = false;
    setLoading(true);
    loadSlots(supplierId, dateKey(from), dateKey(last))
      .then((rows) => {
        if (cancelled) return;
        setSlots((prev) => {
          const next = { ...prev };
          for (let d = new Date(from); d <= last; d.setDate(d.getDate() + 1)) next[dateKey(d)] = [];
          for (const s of rows) {
            const k = slotDateKey(s.start);
            next[k] = [...(next[k] ?? []), s];
          }
          return next;
        });
        setFailed(false);
        onUnavailable(false);
      })
      .catch(() => { if (!cancelled) { setFailed(true); onUnavailable(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, month.y, month.m, today]);

  const biz = !value.afterHours;
  const stepMonth = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    if (new Date(d.getFullYear(), d.getMonth() + 1, 0) < today) return;
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const setMode = (afterHours: boolean) => {
    setPicked("");
    onChange({ afterHours, slotStart: "", afterHoursDate: "" });
  };

  const pickDay = (key: string, hasSlots: boolean) => {
    setPicked(key);
    if (biz && !hasSlots) {
      onChange({ afterHours: true, slotStart: "", afterHoursDate: key });
    } else if (biz) {
      onChange({ slotStart: "" });
    } else {
      onChange({ afterHoursDate: key, slotStart: "" });
    }
  };

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const lead = weekdayIndex(first);
  const daySlots = picked ? (slots[picked] ?? []) : [];

  if (failed) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        We couldn't load available times just now. You can still send your booking; the supplier will arrange a time with you.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-white font-bold mb-3">When do you need us?</div>

      <div className="flex gap-1 bg-black/40 border border-neutral-800 rounded-lg p-1 mb-3">
        <button type="button" onClick={() => setMode(false)}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${biz ? "bg-orange-500 text-black" : "text-neutral-400 hover:text-white"}`}>
          Business hours
        </button>
        <button type="button" onClick={() => setMode(true)}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${!biz ? "bg-orange-500 text-black" : "text-neutral-400 hover:text-white"}`}>
          After-hours callout
        </button>
      </div>

      {!biz && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          After hours means outside the supplier's working hours, weekends and days off. An extra ${Math.round(afterHoursFee)} applies,
          and the supplier arranges the exact time with you.
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month" className="p-1.5 text-neutral-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-white font-semibold text-sm">{MONTHS[month.m]} {month.y}{loading ? " …" : ""}</span>
        <button type="button" onClick={() => stepMonth(1)} aria-label="Next month" className="p-1.5 text-neutral-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((d) => <div key={d} className="text-[11px] text-neutral-500 py-1">{d.slice(0, 2)}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = new Date(month.y, month.m, i + 1);
          const key = dateKey(date);
          const past = date < today;
          const list = slots[key] ?? [];
          const hasSlots = list.length > 0;
          const full = hasSlots && list.every((s) => !s.free);
          const selected = picked === key;
          let cls = "border-neutral-700 text-white hover:border-orange-500";
          let disabled = past;
          if (past) cls = "border-neutral-900 text-neutral-700 cursor-default";
          else if (biz && full) { cls = "border-neutral-800 text-neutral-600 line-through cursor-default"; disabled = true; }
          else if (biz && !hasSlots) cls = "border-dashed border-neutral-700 text-neutral-500 hover:border-orange-500";
          if (selected) cls = "bg-orange-500 border-orange-500 text-black font-semibold";
          return (
            <button key={key} type="button" disabled={disabled} onClick={() => pickDay(key, hasSlots)}
              aria-pressed={selected} aria-label={`${date.getDate()} ${MONTHS[month.m]}`}
              className={`h-9 rounded-md text-sm border transition-colors ${cls}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">
        {biz
          ? "Dashed days have no business-hours times, so they're after hours. Crossed-out days are full."
          : "Pick any day from today."}{" "}
        Times are Queensland time ({SCHEDULE_TIMEZONE.split("/")[1]}).
      </p>

      {biz && picked && (
        <div className="mt-4">
          <div className="text-white text-sm font-semibold mb-2">Choose a time</div>
          {daySlots.length === 0 ? (
            <p className="text-sm text-neutral-500">No business-hours times on this day.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {daySlots.map((s) => {
                const h = slotHour(s.start);
                const on = value.slotStart === s.start;
                return (
                  <button key={s.start} type="button" disabled={!s.free}
                    onClick={() => onChange({ slotStart: s.start, afterHours: false, afterHoursDate: "" })}
                    className={`py-2.5 rounded-lg border text-sm transition-colors ${
                      on ? "bg-orange-500 border-orange-500 text-black font-semibold"
                      : s.free ? "border-neutral-700 text-white hover:border-orange-500"
                      : "border-neutral-800 text-neutral-600 line-through cursor-default"}`}>
                    {formatHour(h)} – {formatHour(h + 2)}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-neutral-500 mt-2">Your time is held for you until the supplier confirms it.</p>
        </div>
      )}

      {!biz && picked && (
        <div className="mt-4">
          <label className="text-white text-sm font-semibold block mb-2">Roughly when on that day?</label>
          <select value={value.afterHoursWhen} onChange={(e) => onChange({ afterHoursWhen: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-orange-500">
            {WHEN_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
    </div>
  );
}
