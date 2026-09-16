import { test, expect } from "@playwright/test";

test("document round trips create real PDF and Word files with extractable text", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const input = new File(
      [
        "# Quarterly review\n\nRevenue grew by 25%. Café and Ελληνικά.\n\nNext steps: publish the report.",
      ],
      "review.md",
    );
    const results: Record<string, unknown> = {};
    for (const target of ["pdf", "docx", "html", "txt"]) {
      const output = await convert(input, target);
      const file = output.files[0];
      const restored = await convert(new File([file.blob], file.name), "md");
      results[target] = {
        size: file.blob.size,
        type: file.blob.type,
        text: await restored.files[0].blob.text(),
      };
    }
    return results;
  });
  for (const target of ["pdf", "docx", "html", "txt"]) {
    expect(result[target].size).toBeGreaterThan(50);
    expect(result[target].text).toContain("Quarterly review");
    expect(result[target].text).toContain("25%");
    expect(result[target].text).toContain("Café");
  }
});

test("CSV and JSON preserve quoted data, reject invalid tables, and escape formulas", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const csv = new File(
      ['name,note\r\nAda,"hello, world"\r\nGrace,"two\nlines"'],
      "table.csv",
    );
    const json = (await convert(csv, "json")).files[0];
    const roundTrip = (await convert(new File([json.blob], json.name), "csv"))
      .files[0];
    const formula = (
      await convert(new File(['[{"name":"=SUM(A1:A9)"}]'], "table.json"), "csv")
    ).files[0];
    const errors = [];
    for (const [text, name] of [
      ["a,a\n1,2", "bad.csv"],
      ['{"a":1}', "bad.json"],
      ["a,b\n1,2,3", "bad.csv"],
    ]) {
      try {
        await convert(
          new File([text], name),
          name.endsWith("csv") ? "json" : "csv",
        );
      } catch (error) {
        errors.push(error.message);
      }
    }
    return {
      json: JSON.parse(await json.blob.text()),
      csv: await roundTrip.blob.text(),
      formula: await formula.blob.text(),
      errors,
    };
  });
  expect(result.json).toEqual([
    { name: "Ada", note: "hello, world" },
    { name: "Grace", note: "two\nlines" },
  ]);
  expect(result.csv).toContain('"hello, world"');
  expect(result.formula).toContain("'=SUM(A1:A9)");
  expect(result.errors).toHaveLength(3);
});

test("all ten input formats produce every offered output", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const { outputsFor } = await import("/src/formats.ts");
    const txt = new File(["A useful test document."], "sample.txt");
    const pdf = (await convert(txt, "pdf")).files[0];
    const docx = (await convert(txt, "docx")).files[0];
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext("2d");
    context.fillStyle = "#174c3c";
    context.fillRect(0, 0, 80, 60);
    const image = await new Promise<Blob>((resolve) => canvas.toBlob(resolve));
    const inputs = {
      txt,
      pdf: new File([pdf.blob], pdf.name),
      docx: new File([docx.blob], docx.name),
      md: new File(["# Heading\n\nSome text."], "sample.md"),
      html: new File(["<h1>Heading</h1><p>Some text.</p>"], "sample.html"),
      csv: new File(["name,value\nexample,12"], "sample.csv"),
      json: new File(['[{"name":"example","value":12}]'], "sample.json"),
      png: new File([image], "sample.png"),
    };
    for (const target of ["jpg", "webp"]) {
      const output = (await convert(inputs.png, target)).files[0];
      inputs[target] = new File([output.blob], output.name);
    }
    const results = [];
    for (const [source, file] of Object.entries(inputs))
      for (const target of outputsFor(source)) {
        const output = await convert(file, target);
        results.push({
          source,
          target,
          size: output.files[0].blob.size,
          type: output.files[0].blob.type,
        });
        if (["jpg", "png", "webp"].includes(target)) {
          const bitmap = await createImageBitmap(output.files[0].blob);
          if (!bitmap.width) throw new Error("Empty image");
          bitmap.close();
        }
      }
    return results;
  });
  expect(new Set(result.map((item) => item.source)).size).toBe(10);
  expect(result.length).toBe(44);
  for (const item of result)
    expect(item.size, `${item.source} to ${item.target}`).toBeGreaterThan(0);
});

test("rejects empty, oversized, unsupported, damaged and scanned inputs; sanitizes HTML", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const errors = [];
    for (const file of [
      new File([], "empty.txt"),
      new File([new Uint8Array(21 * 1024 * 1024)], "large.txt"),
      new File(["test"], "bad.exe"),
      new File(["bad"], "broken.pdf"),
      new File(["bad"], "broken.docx"),
      new File(["bad"], "broken.png"),
    ]) {
      try {
        await convert(file, "md");
      } catch (error) {
        errors.push(error.message);
      }
    }
    const html = new File(
      [
        '<h1>Safe</h1><script>alert(1)</script><img src="https://evil.invalid/a" onerror="alert(2)"><p onclick="alert(3)">Text</p>',
      ],
      "unsafe.html",
    );
    const md = (await convert(html, "md")).files[0];
    const restored = (await convert(new File([md.blob], md.name), "html"))
      .files[0];
    return { errors, html: await restored.blob.text() };
  });
  expect(result.errors).toHaveLength(6);
  expect(result.html).toContain("Safe");
  expect(result.html).not.toContain("<script>");
  expect(result.html).not.toContain("evil.invalid");
  expect(result.html).not.toContain("onclick");
});

test("UI selects, converts, downloads, resets and remains usable on mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Convert file", exact: true }),
  ).toBeDisabled();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Meeting notes\n\nAction items for Friday."),
    });
  await page.locator("#output-format").selectOption("docx");
  await page.getByRole("button", { name: "Convert file", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Download notes.docx" }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download notes.docx" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("notes.docx");
  await page.getByRole("button", { name: "Remove selected file" }).click();
  await expect(page.locator("#results")).toBeHidden();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("scanned PDFs reject text extraction and DOCX expansion limits reject hostile archives", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { convert } = await import("/src/converter.ts");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 20;
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve));
    const pdf = (await convert(new File([blob], "scan.png"), "pdf")).files[0];
    let scanError = "";
    try {
      await convert(new File([pdf.blob], pdf.name), "md");
    } catch (error) {
      scanError = error.message;
    }
    const docx = (await convert(new File(["Safe text"], "safe.txt"), "docx"))
      .files[0];
    const buffer = await docx.blob.arrayBuffer();
    const view = new DataView(buffer);
    for (let i = 0; i < buffer.byteLength - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 100_000_000, true);
        break;
      }
    let zipError = "";
    try {
      await convert(new File([buffer], "hostile.docx"), "txt");
    } catch (error) {
      zipError = error.message;
    }
    return { scanError, zipError };
  });
  expect(result.scanError).toContain("No selectable text");
  expect(result.zipError).toContain("safe processing limit");
});
