import { test, expect } from "@playwright/test";

// These cover routing, rendering and client-side form logic. In CI they run
// against the staging Supabase project (never production); the full
// submit -> quote -> accept flow is intentionally out of scope here.

test("home page shows the three main cards and nothing behind the login", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What do you need?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Get a Hose Quote/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Book a Field Service Job/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Ask a supplier/ }),
  ).toBeVisible();
  // Machines and hose audits live behind the sign-in, not on the public home.
  await expect(page.getByRole("button", { name: /My Machines/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Book a Hose Audit/i })).toHaveCount(0);
});

test("Ask a supplier asks a signed-out visitor to sign in straight away", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Ask a supplier/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  // Back returns to the home cards.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "What do you need?" })).toBeVisible();
});

test("quote wizard opens and step 1 renders + takes input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Get a Hose Quote/ }).click();

  await expect(
    page.getByRole("heading", { name: "Get Competing Hose Quotes" }),
  ).toBeVisible();
  await expect(page.getByText(/Step 1 of 3/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hydraulic Oil" })).toBeVisible();

  // the hose-type <select> is the first select in the wizard
  await page
    .locator("select")
    .first()
    .selectOption({ label: "2-wire braid (SAE 100R2)" });
  await expect(page.locator("select").first()).toHaveValue(/100R2/);
});

test("booking wizard opens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Book a Field Service Job/ }).click();
  await expect(page.getByText(/Step 1 of 3/)).toBeVisible();
});

test("maintenance register link asks a signed-out visitor to sign in", async ({
  page,
}) => {
  await page.goto("/machines");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("enquiry email links ask a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/enquiries/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/supplier/enquiries");
  await expect(page.getByRole("heading", { name: "Supplier Portal" })).toBeVisible();
});

test("/supplier shows the supplier sign-in", async ({ page }) => {
  await page.goto("/supplier");
  await expect(
    page.getByRole("heading", { name: "Supplier Portal" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("you@company.com")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
});

test("/r/ deep link with a malformed token shows 'not found'", async ({
  page,
}) => {
  await page.goto("/r/HQ-nope?t=not-a-uuid");
  await expect(
    page.getByRole("heading", { name: "Request not found" }),
  ).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bottom tab bar navigates and the header stays clean", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button")).toHaveText(["Home", "Account"]); // Machines and Requests appear once signed in
    await expect(page.locator("header button:visible")).toHaveCount(0);
    await nav.getByRole("button", { name: "Account" }).click();
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  });
});
