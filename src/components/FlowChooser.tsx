// The "What do you need?" landing screen — pick quote vs. field-service.
// Stateless. Extracted verbatim from App.tsx.

import { Droplet, Wrench, Truck } from "lucide-react";

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

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onChoose("quote")}
          className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-6 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-4">
            <Wrench className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-white font-bold text-lg mb-1 group-hover:text-orange-500 transition-colors">Get a Hose Quote</div>
          <p className="text-neutral-500 text-sm">Specify your hose and fitting requirements and compare indicative prices from suppliers. On-site installation can be added as part of your quote.</p>
        </button>

        <button
          type="button"
          onClick={() => onChoose("booking")}
          className="w-full text-left bg-neutral-900 border border-neutral-800 hover:border-orange-500 rounded-xl p-6 transition-colors group"
        >
          <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mb-4">
            <Truck className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-white font-bold text-lg mb-1 group-hover:text-orange-500 transition-colors">Book a Field Service Job</div>
          <p className="text-neutral-500 text-sm">Not sure of the exact hose spec yet? Book a technician to come assess and fix it on site — describe the job and get indicative callout pricing.</p>
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
