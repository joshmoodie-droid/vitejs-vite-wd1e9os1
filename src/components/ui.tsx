// Shared presentational primitives. No state, no data — extracted verbatim
// from App.tsx. Dark-theme Tailwind classes; `SectionTitle` takes a lucide
// icon component as the `icon` prop.

export function Field({ label, required, error, children, hint }) {
  return (
    <div className="mb-5">
      <label className="block text-sm text-white mb-2">
        {label}{required && <span className="text-orange-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {!error && hint && <p className="text-xs text-neutral-500 mt-1.5">{hint}</p>}
    </div>
  );
}

export const inputClass = (error) =>
  `w-full bg-neutral-900 border rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none transition-colors ${
    error ? "border-red-500" : "border-neutral-700 focus:border-orange-500"
  }`;

export function StepDot({ n, active, done }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
      done ? "bg-orange-500 border-orange-500 text-black" : active ? "border-orange-500 text-orange-500" : "border-neutral-700 text-neutral-600"
    }`}>
      {n}
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 text-white font-bold text-lg mb-1">
        <Icon className="w-4 h-4 text-orange-500" /> {title}
      </div>
      {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
    </div>
  );
}

export function Badge({ tone, children }) {
  const tones = {
    red: "bg-red-500/15 text-red-400",
    amber: "bg-amber-500/15 text-amber-400",
    neutral: "bg-neutral-700 text-neutral-300",
    orange: "bg-orange-500/15 text-orange-400",
    green: "bg-emerald-500/15 text-emerald-400",
  };
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tones[tone]}`}>{children}</span>;
}
