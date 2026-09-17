import { test, expect } from "@playwright/test";

test("theme follows the system until explicitly selected, then persists and syncs tabs", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Dark mode", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const second = await context.newPage();
  await second.goto("/");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Dark mode", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("theme switch still works when localStorage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "theme.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Dark reader\n\nReadable content."),
    });
  await page.locator("#preview-selected").click();
  await expect(page.locator("#reader-content")).toContainText(
    "Readable content.",
  );
  expect(errors).toEqual([]);
});

test("dark mode covers reader, downloads, library and accessible color pairs", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "theme.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Dark reader\n\nReadable content."),
    });
  await page.locator("#preview-selected").click();
  await expect(page.locator("#reader-content")).toContainText(
    "Readable content.",
  );
  await page.locator("#output-format").selectOption("txt");
  await page.locator("#convert-button").click();
  await page
    .getByRole("button", { name: "Save theme.txt to library", exact: true })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(1);
  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const luminance = (hex: string) => {
      const channels = hex
        .trim()
        .replace("#", "")
        .match(/.{2}/g)!
        .map((value) => parseInt(value, 16) / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return [
      ["--text", "--page"],
      ["--text", "--surface"],
      ["--muted", "--surface"],
      ["--green", "--surface"],
      ["--error-text", "--error-bg"],
      ["#ffffff", "--action-bg"],
    ].map(([fg, bg]) => {
      const a = luminance(fg.startsWith("--") ? css.getPropertyValue(fg) : fg);
      const b = luminance(css.getPropertyValue(bg));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({
    path: "test-results/dark-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Dark mode", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dark-mobile.png",
    fullPage: true,
  });
});
