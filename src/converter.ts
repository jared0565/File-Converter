import {
  formats,
  imageFormats,
  MAX_PIXELS,
  MAX_TEXT,
  outputName,
  outputsFor,
  validateFile,
  type Format,
} from "./formats";
import { parseRows, rowsToCsv, rowsToJson } from "./data";
import { validateDocx } from "./validation";
import DOMPurify from "dompurify";
import { marked } from "marked";
import TurndownService from "turndown";

export interface Artifact {
  name: string;
  blob: Blob;
}
export interface Conversion {
  files: Artifact[];
  warnings: string[];
}
type Block = { text: string; heading: number };
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const plainHtml = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
export function clean(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
    ],
    ALLOWED_ATTR: [],
  });
}
function blocksFrom(html: string): Block[] {
  const root = new DOMParser().parseFromString(clean(html), "text/html").body;
  root.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  root.querySelectorAll("tr").forEach((row) =>
    row.replaceWith(
      Object.assign(document.createElement("p"), {
        textContent: [...row.children]
          .map((cell) => cell.textContent ?? "")
          .join(" | "),
      }),
    ),
  );
  const blocks: Block[] = [];
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ text, heading: 0 });
      return;
    }
    if (!(node instanceof Element)) return;
    if (/^(P|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(node.tagName)) {
      blocks.push({
        text: (node.tagName === "LI" ? "• " : "") + (node.textContent ?? ""),
        heading: /^H/.test(node.tagName) ? Number(node.tagName[1]) : 0,
      });
    } else node.childNodes.forEach(visit);
  }
  root.childNodes.forEach(visit);
  return blocks;
}
export async function textOf(file: File): Promise<string> {
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(await file.arrayBuffer())
    .replace(/^\uFEFF/, "");
  if (text.length > MAX_TEXT)
    throw new Error(
      "Text files are limited to one million characters. Split this file and try again.",
    );
  if (text.includes("\0"))
    throw new Error("This does not appear to be a UTF-8 text file.");
  return text;
}
function artifact(name: string, target: Format, data: BlobPart): Artifact {
  return {
    name: outputName(name, target),
    blob: new Blob([data], { type: formats[target].mime }),
  };
}
export async function pdfDocument(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    return { pdf: await task.promise, task };
  } catch {
    await task.destroy();
    throw new Error(
      "Unable to read this PDF. It may be damaged or password-protected. Save an unlocked copy and try again.",
    );
  }
}
async function canvasBlob(
  canvas: HTMLCanvasElement,
  target: Format,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== formats[target].mime)
          reject(
            new Error(
              "Your browser cannot encode this image format. Try PNG or JPG.",
            ),
          );
        else resolve(blob);
      },
      formats[target].mime,
      0.92,
    ),
  );
}
async function imageConvert(file: File, target: Format): Promise<Conversion> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This image could not be decoded. Check that the file matches its extension.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS)
      throw new Error(
        "Images are limited to 24 megapixels. Resize this image first.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Your browser does not support image conversion.");
    if (target === "jpg" || target === "pdf") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    if (target !== "pdf")
      return {
        files: [
          {
            name: outputName(file.name, target),
            blob: await canvasBlob(canvas, target),
          },
        ],
        warnings: [
          "Animated images export their first frame. JPG uses a white background for transparency.",
        ],
      };
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(
      await (await canvasBlob(canvas, "png")).arrayBuffer(),
    );
    const page = pdf.addPage([595.28, 841.89]);
    const size = image.scale(
      Math.min(515.28 / image.width, 761.89 / image.height),
    );
    page.drawImage(image, {
      x: (595.28 - size.width) / 2,
      y: (841.89 - size.height) / 2,
      ...size,
    });
    return {
      files: [artifact(file.name, "pdf", new Uint8Array(await pdf.save()))],
      warnings: [],
    };
  } finally {
    bitmap.close();
  }
}
async function makePdf(blocks: Block[]): Promise<Uint8Array<ArrayBuffer>> {
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const response = await fetch("/fonts/NotoSans-Regular.ttf");
  if (!response.ok)
    throw new Error(
      "The PDF font could not load. Check your connection and retry.",
    );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await response.arrayBuffer(), {
    subset: true,
  });
  const supported = new Set(font.getCharacterSet());
  const unsupported = blocks.some((block) =>
    [...block.text].some(
      (char) => !/\s/.test(char) && !supported.has(char.codePointAt(0)!),
    ),
  );
  if (unsupported)
    throw new Error(
      "This document contains characters the PDF font cannot render. Download Word or HTML to preserve them.",
    );
  let page = pdf.addPage();
  let y = 790;
  function line(text: string, size: number) {
    if (y < 55) {
      if (pdf.getPageCount() >= 200)
        throw new Error("The output exceeds 200 pages. Split this document.");
      page = pdf.addPage();
      y = 790;
    }
    page.drawText(text, { x: 48, y, font, size, color: rgb(0.12, 0.15, 0.18) });
    y -= size * 1.5;
  }
  for (const block of blocks) {
    const size = block.heading ? Math.max(12, 24 - block.heading * 2) : 11;
    for (const paragraph of block.text.split("\n")) {
      let current = "";
      for (const word of paragraph.replace(/\t/g, "    ").split(" ")) {
        const candidate = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(candidate, size) <= 498) {
          current = candidate;
          continue;
        }
        if (current) line(current, size);
        current = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(current + char, size) > 498) {
            line(current, size);
            current = "";
          }
          current += char;
        }
      }
      line(current, size);
    }
    y -= 8;
  }
  return new Uint8Array(await pdf.save());
}
export async function convert(
  file: File,
  target: Format,
  progress: (message: string) => void = () => {},
): Promise<Conversion> {
  const source = validateFile(file);
  if (!outputsFor(source).includes(target))
    throw new Error(
      "This conversion is not supported. Select an available output format.",
    );
  progress("Reading your file…");
  if (imageFormats.includes(source)) return imageConvert(file, target);
  let html = "";
  const warnings: string[] = [];
  if (source === "pdf") {
    const { pdf, task } = await pdfDocument(file);
    try {
      if (pdf.numPages > (imageFormats.includes(target) ? 30 : 200))
        throw new Error(
          "PDFs are limited to 200 pages for text extraction or 30 pages for image export. Split this PDF first.",
        );
      const files: Artifact[] = [];
      const pages: string[] = [];
      let totalText = 0;
      let totalImageBytes = 0;
      let emptyPages = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        progress(`Reading page ${i} of ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        if (imageFormats.includes(target)) {
          const base = page.getViewport({ scale: 1.5 });
          const scale = Math.min(
            1.5,
            1.5 * Math.sqrt(MAX_PIXELS / (base.width * base.height)),
          );
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Your browser cannot render this PDF.");
          await page.render({
            canvasContext: context,
            canvas,
            viewport,
            background: "#ffffff",
          }).promise;
          const blob = await canvasBlob(canvas, target);
          totalImageBytes += blob.size;
          if (totalImageBytes > 100_000_000)
            throw new Error(
              "The exported images exceed 100 MB. Split this PDF first.",
            );
          files.push({
            name: outputName(file.name, target).replace(
              `.${target}`,
              `-page-${i}.${target}`,
            ),
            blob,
          });
          canvas.width = canvas.height = 0;
        } else {
          const content = await page.getTextContent();
          const text = content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("")
            .trim();
          totalText += text.length;
          if (totalText > MAX_TEXT)
            throw new Error(
              "The extracted PDF text exceeds one million characters. Split this PDF first.",
            );
          if (!text) emptyPages++;
          pages.push(text);
        }
        page.cleanup();
      }
      if (files.length) return { files, warnings: [] };
      if (emptyPages === pdf.numPages)
        throw new Error(
          "No selectable text was found. This may be a scanned PDF; OCR is not included. You can export its pages as images.",
        );
      html = pages.map(plainHtml).join("<hr>");
      warnings.push(
        "PDF text was extracted in reading order. Columns, images and exact page layout are not preserved.",
      );
      if (emptyPages)
        warnings.push(
          `${emptyPages} page(s) had no selectable text and were omitted. OCR is not included.`,
        );
    } finally {
      await task.destroy();
    }
  } else if (source === "docx") {
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
    html = clean(result.value);
    warnings.push(
      "Document text and basic structure are converted. Embedded images, comments and exact Word layout are not preserved.",
    );
  } else {
    const text = await textOf(file);
    if (source === "csv" || source === "json") {
      const rows = parseRows(text, source);
      if (rows.length > 20001 || rows[0].length > 200)
        throw new Error("Tables are limited to 20,000 rows and 200 columns.");
      if (target === "csv")
        return {
          files: [artifact(file.name, target, rowsToCsv(rows))],
          warnings: [
            "Formula-like cells are prefixed with an apostrophe for spreadsheet safety. Nested JSON values are serialized as text.",
          ],
        };
      if (target === "json")
        return {
          files: [artifact(file.name, target, rowsToJson(rows))],
          warnings: [
            "CSV values are preserved as strings. The first row is used as field names.",
          ],
        };
      const cell = (value: string) =>
        value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
      const markdown = [
        rows[0].map(cell).join(" | "),
        rows[0].map(() => "---").join(" | "),
        ...rows.slice(1).map((row) => row.map(cell).join(" | ")),
      ]
        .map((row) => `| ${row} |`)
        .join("\n");
      if (target === "md")
        return { files: [artifact(file.name, target, markdown)], warnings: [] };
      html =
        "<table>" +
        rows
          .map(
            (row, index) =>
              "<tr>" +
              row
                .map(
                  (value) =>
                    "<" +
                    (index ? "td" : "th") +
                    ">" +
                    escape(value) +
                    "</" +
                    (index ? "td" : "th") +
                    ">",
                )
                .join("") +
              "</tr>",
          )
          .join("") +
        "</table>";
    } else if (source === "md") html = clean(await marked.parse(text));
    else if (source === "html") {
      html = clean(text);
      warnings.push(
        "Scripts, styles, links and embedded media are removed. Basic document content is retained.",
      );
    } else html = plainHtml(text);
  }
  if (html.length > 4_000_000)
    throw new Error(
      "The document is too complex to convert safely. Split it into smaller files.",
    );
  const blocks = blocksFrom(html);
  if (!blocks.some((block) => block.text.trim()))
    throw new Error("No convertible text was found in this document.");
  progress("Creating your download…");
  let data: BlobPart;
  if (target === "html")
    data = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(file.name)}</title><style>body{font:18px/1.65 system-ui;max-width:75ch;margin:3rem auto;padding:0 1.5rem;overflow-wrap:anywhere}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:.5rem}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`;
  else if (target === "md")
    data = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    }).turndown(html);
  else if (target === "txt")
    data = blocks.map((block) => block.text).join("\n\n");
  else if (target === "pdf") {
    data = await makePdf(blocks);
    warnings.push(
      "PDF uses a clean, reflowed text layout. Images and original pagination are not preserved.",
    );
  } else if (target === "docx") {
    const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
    const headings = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    data = await Packer.toBlob(
      new Document({
        sections: [
          {
            children: blocks.flatMap((block) =>
              block.text.split("\n").map(
                (text) =>
                  new Paragraph({
                    text,
                    heading: block.heading
                      ? headings[block.heading - 1]
                      : undefined,
                    spacing: { after: 160 },
                  }),
              ),
            ),
          },
        ],
      }),
    );
    warnings.push(
      "Word output preserves text and headings using a simple layout. Inline styling and embedded media are not retained.",
    );
  } else throw new Error("Unsupported output format.");
  return { files: [artifact(file.name, target, data)], warnings };
}
