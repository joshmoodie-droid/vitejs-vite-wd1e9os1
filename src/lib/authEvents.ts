// The auth library announces "SIGNED_IN" more than once for the same session
// (another tab of the site opening, the session being re-checked when the tab
// regains focus). Only a change of user is a real sign-in. Treating every
// announcement as one threw signed-in customers off the screen they were on,
// wiping a half-filled quote or the quote they'd just submitted.
export function isNewSignIn(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  return event === "SIGNED_IN" && !!nextUserId && nextUserId !== previousUserId;
}
