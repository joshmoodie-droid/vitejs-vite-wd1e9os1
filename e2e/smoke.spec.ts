import { test, expect } from "@playwright/test";

// These cover routing, rendering and client-side form logic. In CI they run
// against the staging Supabase project (never production); the full
// submit -> quote -> accept flow is intentionally out of scope here.

test("home page shows both entry points", async ({ page }) => {
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
