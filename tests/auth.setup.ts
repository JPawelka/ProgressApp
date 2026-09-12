import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(import.meta.dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD in the environment or a gitignored .env");
  }

  mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/auth/signin");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/auth/signin" || url.searchParams.has("error"));

  if (page.url().includes("/auth/signin")) {
    const message = new URL(page.url()).searchParams.get("error") ?? "Sign in stayed on the form";
    throw new Error(message);
  }

  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();

  await page.context().storageState({ path: authFile });
  expect(existsSync(authFile)).toBe(true);
});
