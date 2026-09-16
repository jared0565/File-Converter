export const formats = {
  pdf: { name: "PDF", mime: "application/pdf", group: "Document" },
  docx: {
    name: "Word",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    group: "Document",
  },
  md: { name: "Markdown", mime: "text/markdown", group: "Document" },
  txt: { name: "Plain text", mime: "text/plain", group: "Document" },
  html: { name: "HTML", mime: "text/html", group: "Document" },
  csv: { name: "CSV", mime: "text/csv", group: "Data" },
  json: { name: "JSON", mime: "application/json", group: "Data" },
  jpg: { name: "JPG", mime: "image/jpeg", group: "Image" },
  png: { name: "PNG", mime: "image/png", group: "Image" },
  webp: { name: "WebP", mime: "image/webp", group: "Image" },
} as const;
export type Format = keyof typeof formats;
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT = 1_000_000;
export const MAX_PIXELS = 24_000_000;
export const imageFormats: Format[] = ["jpg", "png", "webp"];
const documents: Format[] = ["pdf", "docx", "md", "txt", "html"];
export function detectFormat(name: string): Format | undefined {
  const extension = name.split(".").pop()?.toLowerCase();
  const normalized =
    extension === "jpeg"
      ? "jpg"
      : extension === "markdown"
        ? "md"
        : extension === "htm"
          ? "html"
          : extension;
  return normalized && Object.hasOwn(formats, normalized)
    ? (normalized as Format)
    : undefined;
}
export function outputsFor(source: Format): Format[] {
  const outputs = imageFormats.includes(source)
    ? ([...imageFormats, "pdf"] as Format[])
    : source === "pdf"
      ? [...documents, ...imageFormats]
      : source === "csv" || source === "json"
        ? (["csv", "json", "txt", "md", "html", "pdf", "docx"] as Format[])
        : documents;
  return outputs.filter((value) => value !== source);
}
export function validateFile(file: File): Format {
  const type = detectFormat(file.name);
  if (!type)
    throw new Error(
      "This format is not supported. Choose one of the ten formats listed below.",
    );
  if (!file.size)
    throw new Error("This file is empty. Choose a file with content.");
  if (file.size > MAX_BYTES)
    throw new Error("This file exceeds 20 MB. Choose a smaller file.");
  return type;
}
export function outputName(name: string, target: Format): string {
  return (
    (name
      .replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 120) || "converted") +
    "." +
    target
  );
}
