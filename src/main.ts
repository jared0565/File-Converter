import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./style.css";
import {
  formats,
  imageFormats,
  outputsFor,
  validateFile,
  type Format,
} from "./formats";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = $<HTMLInputElement>("file-input");
const drop = $<HTMLButtonElement>("drop-zone");
const select = $<HTMLSelectElement>("output-format");
const button = $<HTMLButtonElement>("convert-button");
const cancel = $<HTMLButtonElement>("cancel-button");
let selected: File | undefined;
let active = false;
let operation = 0;
let preferred: { source: Format; target: Format } | undefined;
let urls: string[] = [];
function clearResults() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls = [];
  $("results").hidden = true;
  $("downloads").replaceChildren();
  $("warnings").replaceChildren();
}
function status(message: string, error = false) {
  const element = $("status");
  element.hidden = !message;
  element.textContent = message;
  element.classList.toggle("error", error);
  element.setAttribute("role", error ? "alert" : "status");
}
function setBusy(busy: boolean) {
  active = busy;
  input.disabled = busy;
  drop.disabled = busy;
  select.disabled = busy || !selected;
  button.disabled = busy || !selected;
  $<HTMLButtonElement>("remove-file").disabled = busy;
  cancel.hidden = !busy;
  button.querySelector("span")!.textContent = busy
    ? "Converting…"
    : "Convert file";
  document
    .querySelectorAll<HTMLButtonElement>("[data-from]")
    .forEach((item) => {
      item.disabled = busy;
    });
}
function help() {
  if (!selected) return;
  const source = validateFile(selected);
  const target = select.value as Format;
  $("format-help").textContent =
    source === "pdf" && !imageFormats.includes(target)
      ? "Extracts selectable text. Scans need OCR; original layouts and images are not preserved."
      : source === "pdf"
        ? "Each PDF page becomes a separate image download. Up to 30 pages."
        : imageFormats.includes(source)
          ? target === "pdf"
            ? "Places your image on a white A4 page."
            : "Keeps image dimensions. JPG flattens transparency onto white; animations use the first frame."
          : target === "csv"
            ? "Converts an array of JSON objects to rows. Formula-like cells are escaped for safety."
            : target === "json"
              ? "Uses the first CSV row as field names. All cell values remain strings."
              : "Converts text and basic structure. Complex formatting and embedded images are not preserved.";
}
function choose(file: File) {
  if (active) return;
  try {
    const source = validateFile(file);
    selected = file;
    clearResults();
    status("");
    $("file-name").textContent = file.name;
    $("file-size").textContent =
      `${file.size < 1024 * 1024 ? (file.size / 1024).toFixed(1) + " KB" : (file.size / 1024 / 1024).toFixed(1) + " MB"} · ${formats[source].name}`;
    $("file-badge").textContent = source.toUpperCase();
    $("selected-file").hidden = false;
    drop.classList.add("compact");
    select.replaceChildren(
      ...outputsFor(source).map(
        (format) => new Option(`${formats[format].name} (.${format})`, format),
      ),
    );
    if (preferred?.source === source) select.value = preferred.target;
    else
      select.value =
        source === "pdf"
          ? "docx"
          : outputsFor(source).includes("pdf")
            ? "pdf"
            : outputsFor(source)[0];
    preferred = undefined;
    setBusy(false);
    help();
    select.focus();
  } catch (error) {
    status(
      error instanceof Error ? error.message : "Unable to read this file.",
      true,
    );
  }
}
drop.addEventListener("click", () => input.click());
input.addEventListener("change", () => {
  if (input.files?.[0]) choose(input.files[0]);
  input.value = "";
});
for (const event of ["dragenter", "dragover"])
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    if (!active) drop.classList.add("dragging");
  });
for (const event of ["dragleave", "drop"])
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
  });
drop.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files.length === 1) choose(e.dataTransfer.files[0]);
  else status("Choose one file at a time.", true);
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
select.addEventListener("change", () => {
  clearResults();
  status("");
  help();
});
$("remove-file").addEventListener("click", () => {
  selected = undefined;
  clearResults();
  status("");
  $("selected-file").hidden = true;
  drop.classList.remove("compact");
  select.replaceChildren(new Option("Choose a file first", ""));
  $("format-help").textContent =
    "Available formats appear once you choose a file.";
  setBusy(false);
  drop.focus();
});
cancel.addEventListener("click", () => {
  operation++;
  status("Conversion canceled. Waiting for processing to finish…");
  cancel.disabled = true;
});
button.addEventListener("click", async () => {
  if (!selected || active) return;
  const current = ++operation;
  const file = selected;
  const target = select.value as Format;
  clearResults();
  setBusy(true);
  cancel.disabled = false;
  status("Loading converter…");
  try {
    const { convert } = await import("./converter");
    const result = await convert(file, target, (message) => {
      if (current === operation) status(message);
    });
    if (current !== operation) return;
    for (const resultFile of result.files) {
      const url = URL.createObjectURL(resultFile.blob);
      urls.push(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = resultFile.name;
      link.className = "download-link";
      link.textContent = `Download ${resultFile.name}`;
      $("downloads").append(link);
    }
    for (const warning of result.warnings) {
      const li = document.createElement("li");
      li.textContent = warning;
      $("warnings").append(li);
    }
    $("results").hidden = false;
    status("Conversion complete. Your download is ready.");
    $("downloads").querySelector("a")?.focus();
  } catch (error) {
    if (current === operation)
      status(
        error instanceof Error
          ? error.message
          : "Conversion failed. Try a smaller file or a different output.",
        true,
      );
  } finally {
    setBusy(false);
    if (current !== operation)
      status("Conversion canceled. You can choose another file.");
  }
});
for (const [extension, format] of Object.entries(formats)) {
  const item = document.createElement("button");
  item.className = `format-item ${format.group.toLowerCase()}`;
  item.type = "button";
  const ext = document.createElement("strong");
  ext.textContent = extension.toUpperCase();
  const name = document.createElement("span");
  name.textContent = format.name;
  item.append(ext, name);
  item.setAttribute("aria-label", `Show ${format.name} conversions`);
  item.addEventListener("click", () => {
    document
      .querySelectorAll(".format-item")
      .forEach((el) => el.classList.remove("selected"));
    item.classList.add("selected");
    $("format-detail").textContent = `${format.name} converts to ${outputsFor(
      extension as Format,
    )
      .map((type) => formats[type].name)
      .join(", ")}.`;
  });
  $("format-list").append(item);
}
document.querySelectorAll<HTMLButtonElement>("[data-from]").forEach((item) =>
  item.addEventListener("click", () => {
    preferred = {
      source: item.dataset.from as Format,
      target: item.dataset.to as Format,
    };
    if (selected && validateFile(selected) === preferred.source) {
      select.value = preferred.target;
      clearResults();
      help();
      $("converter").scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      status(
        `Choose a ${formats[preferred.source].name} file to convert to ${formats[preferred.target].name}.`,
      );
      input.click();
    }
  }),
);
window.addEventListener("pagehide", () => clearResults());
