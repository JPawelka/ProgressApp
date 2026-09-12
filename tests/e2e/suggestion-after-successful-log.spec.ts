// risk: test-plan.md #1 — after a successful log, the owner never gets a next-session suggestion they can accept or override
// seed: tests/seed.spec.ts

import { expect, test } from "@playwright/test";

test.describe("After a successful log, the owner gets a next-session suggestion", () => {
  test("logged workout offers increase/hold/deload and a suggested load", async ({ page }) => {
    // Open Plans. Generate a plan only when the owner has none.
    await page.goto("/plans");
    await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();

    const planLinks = page.getByRole("list").getByRole("link");
    if ((await planLinks.count()) === 0) {
      await page.getByRole("button", { name: "Generate plan" }).click();
    } else {
      await planLinks.first().click();
    }
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/i);

    // Open the log form for this plan.
    await page.getByRole("link", { name: "Log session" }).click();
    await page.waitForURL(/\/plans\/.+\/log$/);
    await expect(page.getByRole("button", { name: "Save session" })).toBeVisible();

    // Save the pre-filled complete set(s). A missing session id must not skip the suggestion screen.
    const logResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && /\/api\/plans\/.+\/sessions$/.test(response.url()),
    );
    await page.getByRole("button", { name: "Save session" }).click();
    expect((await logResponse).ok()).toBe(true);

    await page.waitForURL(/\/sessions\/.+\/suggestion$/);
    await expect(page.getByRole("heading", { name: "Next session" })).toBeVisible();
    await expect(
      page.getByText("Increase").or(page.getByText("Hold")).or(page.getByText("Deload")).first(),
    ).toBeVisible();
    const suggestedLoad = page.getByLabel("Suggested load (kg)").first();
    await expect(suggestedLoad).toBeVisible();
    await expect(suggestedLoad).not.toHaveValue("");

    // Skip apply so this run does not change plan defaults.
    await page.getByRole("link", { name: "Skip" }).click();
    await page.waitForURL(/\/sessions$/);
  });
});
