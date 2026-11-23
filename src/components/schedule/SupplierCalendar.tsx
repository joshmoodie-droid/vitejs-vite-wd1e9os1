// The supplier "Calendar" tab: what is booked, held and blocked, in date order,
// plus the actions that change it: block your own time, move a booking to another
// free slot, and arrange a time for an after-hours callout (which holds no slot
// until you agree one). A supplier sees their own; an admin picks a supplier
// first (AdminCalendar). All times are Queensland time.

import { Fragment, useCallback, useEffect, useState } from "react";
import { Ban, CalendarClock, CalendarPlus, Move } from "lucide-react";
import { Badge } from "../ui";
import { formatHour, slotDateKey, slotHour, type Slot } from "../../lib/schedule";
import {
  arrangeTime, blockTime, brisbaneIso, dateHeading, holdLeft, loadAppointments, loadSupplierSlots, moveBooking,
  nextDay, releaseBlock, timeRange, type Appointment,
} from "../../lib/calendar";

const card = "bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6";
const field = "bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-2 text-white text-sm outline-none focus:border-orange-500";
const ghost = "border border-neutral-700 hover:border-orange-500 text-neutral-300 hover:text-white rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors";
const primary = "bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-black font-bold rounded-lg px-4 py-2 text-sm transition-colors";

type Notice = { ok: boolean; text: string } | null;

export function SupplierCalendar({
  supplierId, requests, quotes, onReload,
}: {
  supplierId: string;
  requests: any[];
  quotes: any[];
  onReload: () => void; // reload the app's jobs so cards show the new time
}) {
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setAppts(await loadAppointments(supplierId));
      setNow(Date.now());
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [supplierId]);
  useEffect(() => { load(); }, [load]);

  // Run a change, then refresh the calendar and the app's job cards.
  const act = async (done: string, fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ ok: true, text: done });
      await load();
      onReload();
      return true;
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "That didn't work — please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reqById = new Map<string, any>(requests.map((r) => [r.id, r]));

  // after-hours callouts waiting for the supplier to agree a time
  const needsTime = requests.filter((r) =>
    r.requestType === "booking" && r.afterHours && r.selectedSupplierId === supplierId && !r.scheduledStart
    && quotes.some((q) => q.requestId === r.id && q.supplierId === supplierId && !["rejected", "declined", "completed"].includes(q.status)));

  // ---- block time form ----
  const [bDay, setBDay] = useState("");
  const [bEndDay, setBEndDay] = useState("");
  const [bAllDay, setBAllDay] = useState(true);
  const [bFrom, setBFrom] = useState("07:00");
  const [bTo, setBTo] = useState("17:00");
  const [bNote, setBNote] = useState("");
  const blockProblem = !bDay ? "Pick a day." : bEndDay && bEndDay < bDay ? "The last day can't be before the first." : !bAllDay && bTo <= bFrom && (!bEndDay || bEndDay === bDay) ? "The end must be after the start." : "";
  const submitBlock = async () => {
    const last = bEndDay || bDay;
    const start = brisbaneIso(bDay, bAllDay ? "00:00" : bFrom);
    const end = bAllDay ? brisbaneIso(nextDay(last), "00:00") : brisbaneIso(last, bTo);
    const ok = await act("Time blocked.", () => blockTime(supplierId, start, end, bNote));
    if (ok) { setBDay(""); setBEndDay(""); setBNote(""); }
  };

  // ---- move a booking ----
  const [moving, setMoving] = useState<string | null>(null);
  const [moveDay, setMoveDay] = useState("");
  const [moveSlots, setMoveSlots] = useState<Slot[] | null>(null);
  const [moveError, setMoveError] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const pickMoveDay = async (day: string) => {
    setMoveDay(day); setMoveTo(""); setMoveSlots(null); setMoveError("");
    if (!day) return;
    try { setMoveSlots(await loadSupplierSlots(supplierId, day)); }
    catch (e) { setMoveError(e instanceof Error ? e.message : String(e)); }
  };
  const openMove = (requestId: string) => { setMoving(moving === requestId ? null : requestId); setMoveDay(""); setMoveSlots(null); setMoveTo(""); setMoveError(""); };

  // ---- arrange an after-hours time ----
  const [arranging, setArranging] = useState<string | null>(null);
  const [aDay, setADay] = useState("");
  const [aTime, setATime] = useState("18:00");
  const [aHours, setAHours] = useState(2);
  const submitArrange = async (requestId: string) => {
    const start = brisbaneIso(aDay, aTime);
    const end = new Date(new Date(start).getTime() + aHours * 3600000).toISOString();
    const ok = await act("Time arranged. It's on the calendar.", () => arrangeTime(requestId, start, end));
    if (ok) { setArranging(null); setADay(""); }
  };

  // ---- the agenda, grouped by day ----
  const groups: { heading: string; items: Appointment[] }[] = [];
  for (const a of appts ?? []) {
    const heading = dateHeading(a.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(a); else groups.push({ heading, items: [a] });
  }

  return (
    <div>
      {notice && (
        <div role={notice.ok ? "status" : "alert"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
          {notice.text}
        </div>
      )}

      {needsTime.length > 0 && (
        <div className={card}>
          <div className="flex items-center gap-2 text-white font-bold mb-1"><CalendarClock className="w-4 h-4 text-orange-500" /> After-hours jobs that need a time</div>
          <p className="text-neutral-500 text-sm mb-4">The customer asked for an after-hours callout. Agree a time with them, then put it on the calendar here so nobody books over it.</p>
          <div className="space-y-3">
            {needsTime.map((r) => (
              <div key={r.id} className="bg-black/30 rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white font-semibold break-words">{r.name || "Customer"} · {r.equipmentType} — {r.issue}</div>
                    <div className="text-xs text-neutral-500 font-mono">{r.id}</div>
                    <div className="text-sm text-amber-300">{r.preferredTime}</div>
                  </div>
                  <button className={ghost} onClick={() => { setArranging(arranging === r.id ? null : r.id); setADay(""); }}>
                    {arranging === r.id ? "Close" : "Arrange a time"}
                  </button>
                </div>
                {arranging === r.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-xs text-neutral-400">Day<input type="date" className={`${field} block mt-1`} value={aDay} onChange={(e) => setADay(e.target.value)} /></label>
                    <label className="text-xs text-neutral-400">Start<input type="time" className={`${field} block mt-1`} value={aTime} onChange={(e) => setATime(e.target.value)} /></label>
                    <label className="text-xs text-neutral-400">Length
                      <select className={`${field} block mt-1`} value={aHours} onChange={(e) => setAHours(+e.target.value)}>
                        {[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
                      </select>
                    </label>
                    <button className={primary} disabled={busy || !aDay || !aTime} onClick={() => submitArrange(r.id)}>Put on calendar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={card}>
        <div className="flex items-center gap-2 text-white font-bold mb-1"><CalendarPlus className="w-4 h-4 text-orange-500" /> Upcoming</div>
        <p className="text-neutral-500 text-sm mb-4">Booked and held jobs, and time you've blocked. Held jobs free up on their own if you don't confirm them in time.</p>
        {loadError && <p className="text-red-400 text-sm">Couldn't load the calendar: {loadError}</p>}
        {appts === null && !loadError && <p className="text-neutral-500">Loading…</p>}
        {appts?.length === 0 && <p className="text-neutral-500 text-sm">Nothing booked or blocked yet.</p>}

        {groups.map((g) => (
          <div key={g.heading} className="mb-4 last:mb-0">
            <div className="text-xs font-bold tracking-wide text-orange-500 uppercase mb-2">{g.heading}</div>
            <div className="space-y-2">
              {g.items.map((a) => {
                const r = a.requestId ? reqById.get(a.requestId) : null;
                return (
                  <div key={a.id} className="bg-black/30 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-white font-semibold">{timeRange(a.startsAt, a.endsAt)}</div>
                        {a.kind === "block" ? (
                          <div className="text-sm text-neutral-400">{a.note || "Blocked"}</div>
                        ) : (
                          <>
                            <div className="text-sm text-neutral-300 break-words">{r ? `${r.name || "Customer"} · ${r.equipmentType} — ${r.issue}` : a.requestId}</div>
                            <div className="text-xs text-neutral-500">{r?.location}{r?.location ? " · " : ""}<span className="font-mono">{a.requestId}</span></div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {a.kind === "block" ? <Badge tone="neutral">Blocked</Badge>
                          : a.state === "held" ? <Badge tone="amber">Held{a.heldUntil ? ` · ${holdLeft(a.heldUntil, now)}` : ""}</Badge>
                          : <Badge tone="green">Confirmed</Badge>}
                        {a.kind === "block"
                          ? <button className={ghost} disabled={busy} onClick={() => act("Block removed.", () => releaseBlock(a.id))}>Remove</button>
                          : a.requestId && <button className={`${ghost} flex items-center gap-1`} onClick={() => openMove(a.requestId!)}><Move className="w-3.5 h-3.5" /> Move</button>}
                      </div>
                    </div>

                    {a.kind === "job" && moving === a.requestId && (
                      <div className="mt-3 border-t border-neutral-800 pt-3">
                        <label className="text-xs text-neutral-400">Move to which day?
                          <input type="date" className={`${field} block mt-1`} value={moveDay} onChange={(e) => pickMoveDay(e.target.value)} />
                        </label>
                        {moveError && <p className="text-red-400 text-sm mt-2">{moveError}</p>}
                        {moveDay && moveSlots === null && !moveError && <p className="text-neutral-500 text-sm mt-2">Loading…</p>}
                        {moveSlots && (
                          moveSlots.length === 0
                            ? <p className="text-neutral-500 text-sm mt-2">No open slots that day (closed or a day off).</p>
                            : <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                                {moveSlots.map((s) => (
                                  <button key={s.start} type="button" disabled={!s.free} onClick={() => setMoveTo(s.start)}
                                    className={`py-2 rounded-lg border text-sm transition-colors ${moveTo === s.start ? "bg-orange-500 border-orange-500 text-black font-semibold" : s.free ? "border-neutral-700 text-white hover:border-orange-500" : "border-neutral-800 text-neutral-600 line-through cursor-default"}`}>
                                    {formatHour(slotHour(s.start))} – {formatHour(slotHour(s.start) + 2)}
                                  </button>
                                ))}
                              </div>
                        )}
                        {moveTo && (
                          <div className="mt-3 flex items-center gap-3">
                            <button className={primary} disabled={busy}
                              onClick={async () => { if (await act("Booking moved. The customer is emailed the new time.", () => moveBooking(a.requestId!, moveTo))) setMoving(null); }}>
                              Move here
                            </button>
                            <span className="text-xs text-neutral-500">{slotDateKey(moveTo)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 text-white font-bold mb-1"><Ban className="w-4 h-4 text-orange-500" /> Block time</div>
        <p className="text-neutral-500 text-sm mb-4">Mark time you can't take jobs, like your own appointments. Customers can't book it. It can't overlap a booked job: move that first.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-400">From day<input type="date" className={`${field} block mt-1`} value={bDay} onChange={(e) => setBDay(e.target.value)} /></label>
          <label className="text-xs text-neutral-400">To day (optional)<input type="date" className={`${field} block mt-1`} value={bEndDay} min={bDay} onChange={(e) => setBEndDay(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm text-neutral-300 pb-2"><input type="checkbox" className="accent-orange-500 w-4 h-4" checked={bAllDay} onChange={(e) => setBAllDay(e.target.checked)} /> All day</label>
          {!bAllDay && (
            <>
              <label className="text-xs text-neutral-400">From<input type="time" className={`${field} block mt-1`} value={bFrom} onChange={(e) => setBFrom(e.target.value)} /></label>
              <label className="text-xs text-neutral-400">To<input type="time" className={`${field} block mt-1`} value={bTo} onChange={(e) => setBTo(e.target.value)} /></label>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input className={`${field} flex-1 min-w-[12rem]`} placeholder="Note (optional), e.g. dentist" maxLength={200} value={bNote} onChange={(e) => setBNote(e.target.value)} />
          <button className={primary} disabled={busy || !!blockProblem} onClick={submitBlock}>Block time</button>
        </div>
        {bDay && blockProblem && <p className="text-amber-400 text-sm mt-2">{blockProblem}</p>}
      </div>
    </div>
  );
}

// Admin: choose whose calendar to manage.
export function AdminCalendar({ suppliers, requests, quotes, onReload }: { suppliers: any[]; requests: any[]; quotes: any[]; onReload: () => void }) {
  const [id, setId] = useState<string>(() => suppliers.find((s) => s.companyName === "HoseQuote")?.id ?? suppliers[0]?.id ?? "");
  if (suppliers.length === 0) return <p className="text-neutral-500">No suppliers yet.</p>;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-neutral-400 text-sm">Supplier</span>
        <select aria-label="Supplier" className={field} value={id} onChange={(e) => setId(e.target.value)}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
        </select>
      </div>
      <Fragment key={id}>
        <SupplierCalendar supplierId={id} requests={requests} quotes={quotes} onReload={onReload} />
      </Fragment>
    </div>
  );
}
