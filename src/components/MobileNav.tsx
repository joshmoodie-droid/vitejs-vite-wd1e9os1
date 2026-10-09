// Phone navigation: a labelled tab bar fixed to the bottom of the screen
// (Home · Machines · Requests · Account, plus Supplier for suppliers and
// admins), and the Account page it opens. Hidden from the `sm` breakpoint up,
// where the header links do the job.

import { Home, Tractor, ClipboardList, CircleUser, Building2, LogOut, ChevronRight } from "lucide-react";

export type MobileTab = "home" | "machines" | "requests" | "account" | "supplier";

export function MobileNav({
  active, showSupplier, onSelect,
}: {
  active: MobileTab;
  showSupplier: boolean; // suppliers / admins get their portal as a tab
  onSelect: (tab: MobileTab) => void;
}) {
  const tabs: { key: MobileTab; label: string; icon: typeof Home }[] = [
    { key: "home", label: "Home", icon: Home },
    { key: "machines", label: "Machines", icon: Tractor },
    { key: "requests", label: "Requests", icon: ClipboardList },
    ...(showSupplier ? [{ key: "supplier" as const, label: "Supplier", icon: Building2 }] : []),
    { key: "account", label: "Account", icon: CircleUser },
  ];
  return (
    <nav
      aria-label="Main"
      className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-[#0B0B0C]/95 backdrop-blur border-t border-neutral-800 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className={`flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition-colors ${on ? "text-orange-500" : "text-neutral-500 active:text-white"}`}
            >
              <t.icon className="w-6 h-6" strokeWidth={on ? 2.25 : 1.75} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// The Account tab: who's signed in, the supplier portal and sign out.
export function AccountPanel({
  email, onSignIn, onSupplier, onSignOut,
}: {
  email: string | null; // null when signed out
  onSignIn: () => void;
  onSupplier: () => void;
  onSignOut: () => void;
}) {
  const row = "w-full flex items-center gap-3 px-4 py-4 text-left text-white font-semibold hover:bg-neutral-800/60";
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-white mb-1">Account</h1>
      <p className="text-neutral-500 text-sm mb-6 break-all">{email ? `Signed in as ${email}` : "You're not signed in."}</p>

      {!email && (
        <button onClick={onSignIn} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 rounded-lg mb-6">
          Sign in
        </button>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-800">
        <button onClick={onSupplier} className={row}>
          <Building2 className="w-5 h-5 text-neutral-400" />
          <span className="flex-1">Supplier portal<span className="block text-xs font-normal text-neutral-500">For hose suppliers and HoseQuote admin</span></span>
          <ChevronRight className="w-4 h-4 text-neutral-600" />
        </button>
        {email && (
          <button onClick={onSignOut} className={row}>
            <LogOut className="w-5 h-5 text-neutral-400" />
            <span className="flex-1">Sign out</span>
          </button>
        )}
      </div>
    </div>
  );
}
