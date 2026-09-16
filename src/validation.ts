/** Bound ZIP expansion before passing DOCX to its parser. ZIP64 and encryption are unsupported. */
export function validateDocx(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  let end = -1;
  for (
    let i = buffer.byteLength - 22;
    i >= Math.max(0, buffer.byteLength - 65557);
    i--
  ) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === buffer.byteLength
    ) {
      end = i;
      break;
    }
  }
  const invalid = () =>
    new Error(
      "This Word file is invalid or uses an unsupported archive format. Save it as a new .docx file.",
    );
  if (end < 0) throw invalid();
  const entries = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const directorySize = view.getUint32(end + 12, true);
  if (
    entries > 2000 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    position + directorySize !== end
  )
    throw invalid();
  let total = 0;
  let documentFound = false;
  for (let i = 0; i < entries; i++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50)
      throw invalid();
    const flags = view.getUint16(position + 8, true);
    const compressed = view.getUint32(position + 20, true);
    const expanded = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const next =
      position +
      46 +
      nameLength +
      view.getUint16(position + 30, true) +
      view.getUint16(position + 32, true);
    total += expanded;
    if (
      next > end ||
      flags & 1 ||
      expanded > 20_000_000 ||
      total > 40_000_000 ||
      expanded > Math.max(compressed * 200, 1_000_000)
    )
      throw new Error(
        "This Word file expands beyond the safe processing limit. Try a smaller document.",
      );
    const name = new TextDecoder().decode(
      buffer.slice(position + 46, position + 46 + nameLength),
    );
    if (name === "word/document.xml") documentFound = true;
    position = next;
  }
  if (position !== end || !documentFound) throw invalid();
}
