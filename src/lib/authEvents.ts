// The auth library announces "SIGNED_IN" more than once for the same session
// (another tab of the site opening, the session being re-checked), and the app
// can't reliably tell a genuine sign-in from a repeat by the events alone
// (it often learns about the session first). So decide by what the person is
// looking at: only someone sitting on a landing or sign-in screen is moved to
// My requests. Anyone mid-quote, mid-booking, on the screen showing a quote
// they just sent, or on a screen they chose themselves is left exactly where
// they are, so a repeat announcement can never wipe their form.
export type Screen = { view: string; flowType: string | null; customerView: string };

export function shouldGoToMyRequests(event: string, screen: Screen): boolean {
  return (
    event === "SIGNED_IN" &&
    screen.view !== "supplier" && // supplier / admin sign-ins stay in the portal
    screen.flowType === null &&
    (screen.customerView === "new" || screen.customerView === "auth")
  );
}
