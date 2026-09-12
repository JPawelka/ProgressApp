import { expect, test } from "@playwright/test";

test("plans heading persists after page reload", async ({ page }) => {
  await page.goto("/plans");

  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
});
