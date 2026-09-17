import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const url = process.argv[2];
if (!url || !/^https:\/\/[a-z0-9.-]+\/?$/.test(url))
  throw new Error("Supply the HTTPS deployment origin.");
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  const errors = [];
  const unexpectedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      (!request.url().startsWith(url) &&
        !request.url().startsWith("blob:" + url))
    )
      unexpectedRequests.push(request.url());
  });
  await page.emulateMedia({ colorScheme: "light" });
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  const headers = response.headers();
  assert.ok(headers["content-security-policy"].includes("default-src 'none'"));
  assert.equal(headers["x-content-type-options"], "nosniff");
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  async function convert(name, buffer, target) {
    await page
      .locator("#file-input")
      .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
    await page.locator("#preview-selected").click();
    await expect(
      page.locator("#reader-content").locator(":scope > *").first(),
    ).toBeVisible({ timeout: 30000 });
    await page.locator("#reader-close").click();
    await page.locator("#output-format").selectOption(target);
    await page.locator("#convert-button").click();
    await page.locator(".download-link").first().waitFor({ timeout: 60000 });
    const pending = page.waitForEvent("download");
    await page.locator(".download-link").first().click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    const output = await readFile(await download.path());
    assert.ok(output.length > 0);
    await page
      .getByRole("button", {
        name: "Read " + download.suggestedFilename(),
        exact: true,
      })
      .click();
    await expect(
      page.locator("#reader-content").locator(":scope > *").first(),
    ).toBeVisible({ timeout: 30000 });
    await page.locator("#reader-close").click();
    console.log(
      `${name} -> ${download.suggestedFilename()}: ${output.length} bytes`,
    );
    return { name: download.suggestedFilename(), buffer: output };
  }
  const pdf = await convert(
    "live-test.md",
    Buffer.from("# Live conversion\n\nPrivate files. Café. Reliable results."),
    "pdf",
  );
  assert.equal(pdf.buffer.subarray(0, 5).toString(), "%PDF-");
  const word = await convert(pdf.name, pdf.buffer, "docx");
  assert.equal(word.buffer.subarray(0, 2).toString(), "PK");
  const markdown = await convert(word.name, word.buffer, "md");
  assert.ok(markdown.buffer.toString().includes("Reliable results"));
  const image = await convert(pdf.name, pdf.buffer, "png");
  await convert(image.name, image.buffer, "webp");
  const json = await convert(
    "live-data.csv",
    Buffer.from("name,value\nexample,12"),
    "json",
  );
  assert.deepEqual(JSON.parse(json.buffer.toString()), [
    { name: "example", value: "12" },
  ]);
  await page
    .getByRole("button", {
      name: "Save live-data.json to library",
      exact: true,
    })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Read saved live-data.json", exact: true })
    .click();
  await expect(page.locator("#reader-content")).toContainText("example");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete saved live-data.json", exact: true })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(0);
  assert.deepEqual(errors, [], "Browser errors or CSP violations");
  assert.deepEqual(unexpectedRequests, [], "Unexpected outbound requests");
  console.log(
    "Live smoke checks passed: headers, document round trip, PDF rendering, images, data, native readers, persistent save/reload/delete, no external requests.",
  );
} finally {
  await browser.close();
}
