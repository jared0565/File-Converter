import { test, expect, chromium } from "@playwright/test";

test("all ten formats have safe native reading views, PDF pagination and close cleanup", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const { openReader, closeReader } = await import("/src/reader.ts");
    const text = new File(
      ["Reader sample\n\n" + "Another readable line.\n".repeat(90)],
      "read.txt",
    );
    const files = [
      { name: "read.txt", blob: text },
      {
        name: "read.md",
        blob: new Blob(["# Reader heading\n\n**Readable** paragraph."]),
      },
      {
        name: "read.html",
        blob: new Blob(["<h2>HTML heading</h2><p>Content</p>"]),
      },
      { name: "read.csv", blob: new Blob(['name,note\nAda,"hello, world"']) },
      {
        name: "read.json",
        blob: new Blob(['{"nested":{"value":true},"items":[1,2]}']),
      },
    ];
    for (const target of ["pdf", "docx"])
      files.push((await convert(text, target)).files[0]);
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 30;
    const png = await new Promise<Blob>((resolve) => canvas.toBlob(resolve));
    files.push({ name: "read.png", blob: png });
    for (const target of ["jpg", "webp"])
      files.push((await convert(new File([png], "read.png"), target)).files[0]);
    const output = [];
    for (const file of files) {
      await openReader(file);
      output.push({
        name: file.name,
        note: document.querySelector("#reader-note").textContent,
        children: document.querySelector("#reader-content").childElementCount,
      });
    }
    const pdf = files.find((file) => file.name.endsWith(".pdf"));
    await openReader(pdf);
    return output;
  });
  expect(result).toHaveLength(10);
  for (const file of result)
    expect(file.children, file.name + ": " + file.note).toBeGreaterThan(0);
  await expect(page.locator("#reader-page")).toContainText("Page 1 of");
  await expect(page.locator("#reader-previous")).toBeDisabled();
  await page.locator("#reader-next").click();
  await expect(page.locator("#reader-page")).toContainText("Page 2 of");
  await expect(page.locator("#reader-note")).toContainText("Rendered PDF");
  await page.locator("#reader-zoom").selectOption("2");
  await expect(page.locator("#reader-note")).toContainText("Rendered PDF");
  await page.locator("#reader-close").click();
  await expect(page.locator("#reader")).toBeHidden();
  await expect(page.locator("#reader-content")).toBeEmpty();
});

test("HTML and Markdown readers remove active content and external resources", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("evil.invalid")) outbound.push(request.url());
  });
  await page.goto("/");
  for (const name of ["attack.html", "attack.md"]) {
    await page.locator("#file-input").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(
        '<h1>Safe heading</h1><script>window.readerPwned=1</script><img src="https://evil.invalid/image"><iframe src="https://evil.invalid/frame"></iframe><p onclick="alert(1)">Safe text</p><form><input name="library-status"></form>',
      ),
    });
    await page.locator("#preview-selected").click();
    await expect(page.locator(".reader-document")).toContainText(
      "Safe heading",
    );
    await expect(
      page.locator(
        "#reader-content script, #reader-content img, #reader-content iframe, #reader-content input",
      ),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.readerPwned)).toBeUndefined();
  }
  expect(outbound).toEqual([]);
});

test("saving results is explicit, deduplicated, readable and deletable after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#library-empty")).toBeVisible();
  await page.locator("#file-input").setInputFiles({
    name: "keep.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Keep me\n\nSaved for later."),
  });
  await page.locator("#output-format").selectOption("txt");
  await page.locator("#convert-button").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator(".library-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save keep.txt to library", exact: true })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Save keep.txt to library", exact: true })
    .click();
  await expect(page.locator("#library-status")).toContainText("Saved keep.txt");
  await page.reload();
  await expect(page.locator(".library-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Read saved keep.txt", exact: true })
    .click();
  await expect(page.locator("#reader-content")).toContainText(
    "Saved for later.",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download saved keep.txt", exact: true })
    .click();
  expect((await pending).suggestedFilename()).toBe("keep.txt");
  await page.screenshot({
    path: "test-results/reader-library-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/reader-library-mobile.png",
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete saved keep.txt", exact: true })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#library-empty")).toBeVisible();
});

test("storage transactions deduplicate concurrent writes without overwriting names", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { saveFile, listFiles, loadFile, deleteFile } =
      await import("/src/storage.ts");
    const file = { name: "same.txt", blob: new Blob(["identical content"]) };
    const saves = await Promise.all(
      Array.from({ length: 6 }, () => saveFile(file)),
    );
    await saveFile({ ...file, name: "other.txt" });
    const records = await listFiles();
    const loaded = await loadFile(saves[0].id);
    await deleteFile(saves[0].id);
    let missing = "";
    try {
      await loadFile(saves[0].id);
    } catch (error) {
      missing = error.message;
    }
    return {
      count: records.length,
      ids: new Set(saves.map((item) => item.id)).size,
      text: await loaded.blob.text(),
      missing,
    };
  });
  expect(result).toEqual({
    count: 2,
    ids: 1,
    text: "identical content",
    missing: "This file is no longer saved. Refresh the library.",
  });
});

test("storage denial does not break conversion and reports failed saves", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      value: {
        open() {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#library-status")).toContainText(
    "blocking storage",
  );
  await page.locator("#file-input").setInputFiles({
    name: "test.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Some text"),
  });
  await page.locator("#output-format").selectOption("txt");
  await page.locator("#convert-button").click();
  await page
    .getByRole("button", { name: "Save test.txt to library", exact: true })
    .click();
  await expect(page.locator("#library-status")).toContainText(
    "blocking storage",
  );
  await expect(
    page.getByRole("link", { name: "Download test.txt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save test.txt to library", exact: true }),
  ).toHaveText("Retry save");
});

test("saved bytes survive closing and reopening the browser profile", async ({}, testInfo) => {
  const profile = testInfo.outputPath("browser-profile");
  let context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
  });
  try {
    let page = await context.newPage();
    await page.goto("http://127.0.0.1:5174");
    await page.evaluate(async () => {
      const { saveFile } = await import("/src/storage.ts");
      await saveFile({
        name: "restart.txt",
        blob: new Blob(["Survives browser restart"]),
      });
    });
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
    });
    page = await context.newPage();
    await page.goto("http://127.0.0.1:5174");
    await page
      .getByRole("button", { name: "Read saved restart.txt", exact: true })
      .click();
    await expect(page.locator("#reader-content")).toContainText(
      "Survives browser restart",
    );
  } finally {
    await context.close();
  }
});

test("library capacity failures preserve existing records and blobs", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { saveFile, listFiles, loadFile } = await import("/src/storage.ts");
    await saveFile({ name: "first.txt", blob: new Blob(["keep original"]) });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("file-converter-library", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["metadata", "contents"], "readwrite");
        for (let i = 1; i < 200; i++) {
          const id = "fixture-" + i;
          const blob = new Blob(["x"]);
          tx.objectStore("metadata").put({
            id,
            name: id + ".txt",
            size: 1,
            type: "text/plain",
            savedAt: Date.now(),
          });
          tx.objectStore("contents").put(blob, id);
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
    let error = "";
    try {
      await saveFile({ name: "overflow.txt", blob: new Blob(["overflow"]) });
    } catch (e) {
      error = e.message;
    }
    const records = await listFiles();
    const first = await loadFile(
      records.find((item) => item.name === "first.txt").id,
    );
    return { error, count: records.length, text: await first.blob.text() };
  });
  expect(result.count).toBe(200);
  expect(result.text).toBe("keep original");
  expect(result.error).toContain("200-file or 200 MB limit");
});
