import { detectFormat, formats, imageFormats, MAX_PIXELS } from "./formats";
import type { Artifact } from "./converter";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
import DOMPurify from "dompurify";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let generation = 0;
let pdf: PDFDocumentProxy | undefined;
let task: PDFDocumentLoadingTask | undefined;
let renderTask: RenderTask | undefined;
let pageNumber = 1;
let returnFocus: HTMLElement | null = null;
let imageUrl: string | undefined;
function reset() {
  generation++;
  renderTask?.cancel();
  renderTask = undefined;
  if (task) void task.destroy().catch(() => {});
  pdf = undefined;
  task = undefined;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  $("reader-content").replaceChildren();
  $("reader-controls").hidden = true;
}
export function closeReader(focus = true) {
  reset();
  $("reader").hidden = true;
  if (focus && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}
function note(message: string) {
  $("reader-note").textContent = message;
}
function failure(error: unknown) {
  note(
    error instanceof Error
      ? error.message
      : "Unable to preview this file. Try downloading it instead.",
  );
  $("reader-content").replaceChildren();
}
function textView(text: string) {
  const pre = document.createElement("pre");
  pre.textContent = text;
  pre.className = "reader-text";
  $("reader-content").replaceChildren(pre);
}
async function renderPage(token: number) {
  if (!pdf) return;
  const currentPdf = pdf;
  const previous = $<HTMLButtonElement>("reader-previous");
  const next = $<HTMLButtonElement>("reader-next");
  previous.disabled = next.disabled = true;
  $<HTMLSelectElement>("reader-zoom").disabled = true;
  $("reader-page").textContent = `Page ${pageNumber} of ${pdf.numPages}`;
  note("Rendering page…");
  try {
    const page = await currentPdf.getPage(pageNumber);
    if (token !== generation) return;
    const zoom = Number($<HTMLSelectElement>("reader-zoom").value);
    const base = page.getViewport({ scale: zoom });
    const viewport = page.getViewport({
      scale:
        zoom * Math.min(1, Math.sqrt(MAX_PIXELS / (base.width * base.height))),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.classList.toggle("reader-fit", zoom === 1.25);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `PDF page ${pageNumber}`);
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("PDF rendering is unavailable in this browser.");
    renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "#ffffff",
    });
    await renderTask.promise;
    const text = await page.getTextContent();
    if (token !== generation) return;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Read or select this page’s text";
    const pre = document.createElement("pre");
    pre.className = "reader-text";
    pre.textContent =
      text.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("") || "No selectable text on this page. OCR is not included.";
    details.append(summary, pre);
    $("reader-content").replaceChildren(canvas, details);
    page.cleanup();
    note(
      "Rendered PDF page. Expand the text below to read, select, or copy it.",
    );
  } catch (error) {
    if (token === generation) failure(error);
  } finally {
    if (token === generation) {
      previous.disabled = pageNumber <= 1;
      next.disabled = pageNumber >= currentPdf.numPages;
      $<HTMLSelectElement>("reader-zoom").disabled = false;
    }
  }
}
export async function openReader(
  artifact: Artifact,
  origin: HTMLElement | null = document.activeElement as HTMLElement,
) {
  reset();
  returnFocus = origin;
  const token = generation;
  $("reader").hidden = false;
  $("reader-title").textContent = artifact.name;
  $("reader-title").focus();
  $("reader").scrollIntoView({ block: "start", behavior: "instant" });
  note("Opening file…");
  try {
    const format = detectFormat(artifact.name);
    if (!format || artifact.blob.size > 100 * 1024 * 1024)
      throw new Error("Preview supports the ten listed formats up to 100 MB.");
    const file = new File([artifact.blob], artifact.name, {
      type: formats[format].mime,
    });
    if (imageFormats.includes(format)) {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (width * height > MAX_PIXELS)
        throw new Error("Image previews are limited to 24 megapixels.");
      if (token !== generation) return;
      const img = document.createElement("img");
      imageUrl = URL.createObjectURL(file);
      img.src = imageUrl;
      img.alt = artifact.name;
      img.className = "reader-image";
      $("reader-content").append(img);
      note(`${width} × ${height} pixels · ${formats[format].name}`);
      return;
    }
    const engine = await import("./converter");
    if (token !== generation) return;
    if (format === "pdf") {
      const loaded = await engine.pdfDocument(file);
      if (token !== generation) {
        await loaded.task.destroy();
        return;
      }
      pdf = loaded.pdf;
      task = loaded.task;
      if (pdf.numPages > 200)
        throw new Error(
          "The reader supports PDFs up to 200 pages. Split this document first.",
        );
      pageNumber = 1;
      $("reader-controls").hidden = false;
      $<HTMLSelectElement>("reader-zoom").value = "1.25";
      await renderPage(token);
      return;
    }
    let html: string | undefined;
    if (format === "docx") {
      const { validateDocx } = await import("./validation");
      const buffer = await file.arrayBuffer();
      validateDocx(buffer);
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
          externalFileAccess: false,
          convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
        },
      );
      html = result.value;
    } else {
      const text = await engine.textOf(file);
      if (token !== generation) return;
      if (format === "txt") {
        textView(text);
        note("Plain text · select and copy directly from the reader.");
        return;
      }
      if (format === "json") {
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          throw new Error(
            "This JSON is invalid. Check its syntax and try again.",
          );
        }
        textView(JSON.stringify(value, null, 2));
        note(
          "Formatted JSON · all valid JSON values are supported in the reader.",
        );
        return;
      }
      if (format === "csv") {
        const { default: Papa } = await import("papaparse");
        const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
        if (result.errors.length)
          throw new Error(
            "The CSV is malformed. Check quoting and delimiters.",
          );
        const rows = result.data;
        const width = Math.max(
          0,
          ...rows.slice(0, 501).map((row) => row.length),
        );
        if (width > 200)
          throw new Error("The reader supports up to 200 columns.");
        const table = document.createElement("table");
        const caption = document.createElement("caption");
        caption.textContent = artifact.name;
        table.append(caption);
        for (const [index, row] of rows.slice(0, 501).entries()) {
          const tr = document.createElement("tr");
          row.forEach((value) => {
            const cell = document.createElement(index ? "td" : "th");
            if (!index) cell.setAttribute("scope", "col");
            cell.textContent = value;
            tr.append(cell);
          });
          table.append(tr);
        }
        $("reader-content").replaceChildren(table);
        note(
          rows.length > 501
            ? `Showing the header and first 500 of ${rows.length - 1} rows. Download the file for all rows.`
            : `${Math.max(0, rows.length - 1)} data rows · first row shown as column headings.`,
        );
        return;
      }
      html =
        format === "md"
          ? await (await import("marked")).marked.parse(text)
          : text;
    }
    if (token !== generation) return;
    if (html.length > 4_000_000)
      throw new Error("This document is too complex to preview.");
    // Sanitize with the converter's exact allowlist; inject an inert fragment, never raw user HTML.
    const fragment = DOMPurify.sanitize(engine.clean(html), {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_ATTR: [],
    });
    const article = document.createElement("article");
    article.className = "reader-document";
    article.append(fragment);
    $("reader-content").replaceChildren(article);
    note(
      format === "docx"
        ? "Word reading view · text, headings and tables. Images and exact page layout are not preserved."
        : "Safe reading view · scripts, styles, links and embedded media are removed.",
    );
  } catch (error) {
    if (token === generation) {
      if (task) void task.destroy().catch(() => {});
      task = undefined;
      pdf = undefined;
      $("reader-controls").hidden = true;
      failure(error);
    }
  }
}
$("reader-close").addEventListener("click", () => closeReader());
$("reader-previous").addEventListener("click", () => {
  if (pdf && pageNumber > 1) {
    pageNumber--;
    void renderPage(generation);
  }
});
$("reader-next").addEventListener("click", () => {
  if (pdf && pageNumber < pdf.numPages) {
    pageNumber++;
    void renderPage(generation);
  }
});
$("reader-zoom").addEventListener("change", () => {
  void renderPage(generation);
});
window.addEventListener("pagehide", () => closeReader(false));
