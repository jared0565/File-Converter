import {
  saveFile,
  listFiles,
  loadFile,
  deleteFile,
  storageError,
} from "./storage";
import { openReader } from "./reader";
import type { Artifact } from "./converter";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("file-converter-library")
    : undefined;
let revision = 0;
const downloadUrls = new Set<string>();
function message(text: string, error = false) {
  $("library-status").textContent = text;
  $("library-status").classList.toggle("error", error);
}
export function previewButton(file: Artifact): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "Read file";
  button.setAttribute("aria-label", `Read ${file.name}`);
  button.addEventListener("click", () => {
    void openReader(file, button);
  });
  return button;
}
export function saveButton(file: Artifact): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "Save to library";
  button.setAttribute("aria-label", `Save ${file.name} to library`);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await saveFile(file);
      message(`Saved ${file.name} on this device.`);
      button.textContent = "Saved — save again";
      await refreshLibrary();
      channel?.postMessage("changed");
    } catch (error) {
      message(storageError(error), true);
      button.textContent = "Retry save";
    } finally {
      button.disabled = false;
    }
  });
  return button;
}
export async function refreshLibrary() {
  const current = ++revision;
  try {
    const records = await listFiles();
    if (current !== revision) return;
    $("library-files").replaceChildren();
    $("library-empty").hidden = records.length !== 0;
    const bytes = records.reduce((sum, record) => sum + record.size, 0);
    $("library-usage").textContent =
      `${records.length} of 200 files · ${(bytes / 1024 / 1024).toFixed(1)} of 200 MB`;
    for (const record of records) {
      const row = document.createElement("li");
      row.className = "library-row";
      const info = document.createElement("div");
      info.className = "file-info";
      const name = document.createElement("strong");
      name.textContent = record.name;
      const detail = document.createElement("span");
      detail.textContent = `${(record.size / 1024).toFixed(1)} KB · Saved ${new Date(record.savedAt).toLocaleString()}`;
      info.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "file-actions";
      for (const action of ["Read", "Download", "Delete"] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = action;
        button.setAttribute("aria-label", `${action} saved ${record.name}`);
        button.addEventListener("click", async () => {
          if (
            action === "Delete" &&
            !window.confirm(
              `Delete ${record.name} from this device's library? Downloaded copies will remain.`,
            )
          )
            return;
          button.disabled = true;
          try {
            if (action === "Delete") {
              await deleteFile(record.id);
              message(`Deleted ${record.name}.`);
              await refreshLibrary();
              channel?.postMessage("changed");
              $("library-refresh").focus();
              return;
            }
            const artifact = await loadFile(record.id);
            if (action === "Read") {
              await openReader(artifact, button);
              return;
            }
            const url = URL.createObjectURL(artifact.blob);
            downloadUrls.add(url);
            const link = document.createElement("a");
            link.href = url;
            link.download = artifact.name;
            link.click();
            setTimeout(() => {
              URL.revokeObjectURL(url);
              downloadUrls.delete(url);
            }, 60000);
          } catch (error) {
            message(storageError(error), true);
          } finally {
            button.disabled = false;
          }
        });
        actions.append(button);
      }
      row.append(info, actions);
      $("library-files").append(row);
    }
  } catch (error) {
    if (current === revision) {
      message(storageError(error), true);
      $("library-empty").hidden = true;
      $("library-usage").textContent = "Storage unavailable";
    }
  }
}
async function persistenceStatus() {
  try {
    const protectedStorage = await navigator.storage?.persisted?.();
    $("persistence-status").textContent = protectedStorage
      ? "Browser persistence granted. Clearing site data still removes saved files."
      : "Browser storage may be cleared when space is low. Keep downloads of important files.";
    $<HTMLButtonElement>("protect-storage").disabled =
      !!protectedStorage || !navigator.storage?.persist;
  } catch {
    $("persistence-status").textContent =
      "Storage protection could not be checked. Keep downloads of important files.";
  }
}
$("protect-storage").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("protect-storage");
  button.disabled = true;
  try {
    const granted = await navigator.storage?.persist?.();
    message(
      granted
        ? "Browser persistence granted."
        : "Your browser did not grant persistence. Saved files still survive normal reloads, but may be evicted. Download important files.",
    );
  } catch (error) {
    message(storageError(error), true);
  } finally {
    await persistenceStatus();
  }
});
$("library-refresh").addEventListener("click", () => {
  message("");
  void refreshLibrary();
  void persistenceStatus();
});
if (channel)
  channel.onmessage = () => {
    void refreshLibrary();
  };
window.addEventListener("pageshow", () => {
  void refreshLibrary();
});
window.addEventListener("pagehide", () => {
  downloadUrls.forEach((url) => URL.revokeObjectURL(url));
  downloadUrls.clear();
});
void refreshLibrary();
void persistenceStatus();
