import Papa from "papaparse";
export function parseRows(text: string, source: "csv" | "json"): string[][] {
  if (source === "csv") {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (result.errors.length)
      throw new Error(
        "The CSV is malformed. Check its quoting and delimiters.",
      );
    if (!result.data.length) throw new Error("The CSV has no rows.");
    if (result.data.some((row) => row.length !== result.data[0].length))
      throw new Error("Every CSV row must have the same number of columns.");
    if (
      new Set(result.data[0]).size !== result.data[0].length ||
      result.data[0].some((key) => !key.trim())
    )
      throw new Error("CSV column headings must be nonempty and unique.");
    return result.data;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The JSON is invalid. Check its syntax and try again.");
  }
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    throw new Error("Use a JSON array of objects, with one object per row.");
  const keys = [...new Set(value.flatMap((row) => Object.keys(row)))];
  if (!keys.length) throw new Error("The JSON objects have no fields.");
  const scalar = (v: unknown) =>
    v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return [
    keys,
    ...value.map((row) =>
      keys.map((key) => (Object.hasOwn(row, key) ? scalar(row[key]) : "")),
    ),
  ];
}
export function rowsToJson(rows: string[][]): string {
  return JSON.stringify(
    rows
      .slice(1)
      .map((row) =>
        Object.fromEntries(rows[0].map((key, i) => [key, row[i] ?? ""])),
      ),
    null,
    2,
  );
}
export function rowsToCsv(rows: string[][]): string {
  return Papa.unparse(rows, { escapeFormulae: true, newline: "\r\n" });
}
