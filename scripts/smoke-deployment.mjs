import { chromium } from "@playwright/test";
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
    if (request.method() !== "GET" || !request.url().startsWith(url))
      unexpectedRequests.push(request.url());
  });
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  const headers = response.headers();
  assert.ok(headers["content-security-policy"].includes("default-src 'none'"));
  assert.equal(headers["x-content-type-options"], "nosniff");
  async function convert(name, buffer, target) {
    await page
      .locator("#file-input")
      .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
    await page.locator("#output-format").selectOption(target);
    await page.locator("#convert-button").click();
    await page.locator(".download-link").first().waitFor({ timeout: 60000 });
    const pending = page.waitForEvent("download");
    await page.locator(".download-link").first().click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    const output = await readFile(await download.path());
    assert.ok(output.length > 0);
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
  assert.deepEqual(errors, [], "Browser errors or CSP violations");
  assert.deepEqual(unexpectedRequests, [], "Unexpected outbound requests");
  console.log(
    "Live smoke checks passed: headers, document round trip, PDF rendering, images, data, no external requests.",
  );
} finally {
  await browser.close();
}
