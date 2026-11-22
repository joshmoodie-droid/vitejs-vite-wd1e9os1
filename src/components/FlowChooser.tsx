// The "What do you need?" landing screen — pick quote vs. field-service.
// Stateless. Every card is the same size (auto-rows-fr) and the copy is kept
// to a similar length, so a longer description can't make one card taller.
// Machines and hose audits live behind the sign-in (Machines tab).

import { Droplet, Wrench, Truck } from "lucide-react";

const card = "w-full h-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-6 transition-colors group";
const iconBox = "w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-4";
const title = "text-white font-bold text-lg mb-1 group-hover:text-orange-500 transition-colors";

export function FlowChooser({ onChoose, customer, onSignIn, onMine }) {
  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center justify-center gap-2">
          <Droplet className="w-3.5 h-3.5" /> Hydraulic Hose Service
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">What do you need?</h1>
        <p className="text-neutral-400 max-w-lg mx-auto">Get competing quotes on a hose assembly, or book a technician to come to you.</p>
      </div>

      <div className="grid grid-cols-1 auto-rows-fr gap-4">
        <button type="button" onClick={() => onChoose("quote")} className={card}>
          <div className={iconBox}><Wrench className="w-6 h-6 text-orange-500" /></div>
          <div className={title}>Get a Hose Quote</div>
          <p className="text-neutral-500 text-sm">Compare indicative prices from suppliers for your hose and fittings, with on-site installation if you need it.</p>
        </button>

        <button type="button" onClick={() => onChoose("booking")} className={card}>
          <div className={iconBox}><Truck className="w-6 h-6 text-orange-500" /></div>
          <div className={title}>Book a Field Service Job</div>
          <p className="text-neutral-500 text-sm">Not sure of the exact hose spec? A technician comes to you to assess and fix it on site, with indicative callout pricing.</p>
        </button>
      </div>

      <div className="text-center mt-6 text-sm">
        {customer ? (
          <p className="text-neutral-500">
            Signed in as <span className="text-neutral-300">{customer.email}</span> ·{" "}
            <button onClick={onMine} className="text-orange-500 hover:text-orange-400 font-semibold">
              My requests
            </button>
          </p>
        ) : (
          <p className="text-neutral-500">
            Been here before?{" "}
            <button onClick={onSignIn} className="text-orange-500 hover:text-orange-400 font-semibold">
              Sign in
            </button>{" "}
            to track and accept your quotes.
          </p>
        )}
      </div>
    </div>
  );
}
