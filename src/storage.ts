import { detectFormat } from "./formats";
import type { Artifact } from "./converter";
export interface SavedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  savedAt: number;
}
export const LIBRARY_LIMIT = 200 * 1024 * 1024;
const FILE_LIMIT = 100 * 1024 * 1024;
const COUNT_LIMIT = 200;
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("file-converter-library", 1);
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      reject(
        new Error(
          "Storage is busy. Close other File Converter tabs and retry.",
        ),
      );
    }, 10000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("metadata", { keyPath: "id" });
      request.result.createObjectStore("contents");
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      clearTimeout(timer);
      failed = true;
      reject(new Error("Close other File Converter tabs to unlock storage."));
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (failed) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (
    tx: IDBTransaction,
    result: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["metadata", "contents"], mode);
      let result: T;
      let failure: Error | undefined;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Storage transaction failed."));
      tx.onerror = () => {
        /* Abort handles failures, including quota errors. */
      };
      try {
        work(
          tx,
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
            tx.abort();
          },
        );
      } catch (error) {
        failure = error instanceof Error ? error : new Error("Storage failed.");
        tx.abort();
      }
    });
  } finally {
    db.close();
  }
}
export async function saveFile(file: Artifact): Promise<SavedFile> {
  if (
    !detectFormat(file.name) ||
    !file.blob.size ||
    file.blob.size > FILE_LIMIT
  )
    throw new Error(
      "Only supported files up to 100 MB can be saved. Download this file instead.",
    );
  // Content and name identify a save, making retries and simultaneous tab saves idempotent.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.blob.arrayBuffer(),
  );
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const metadata: SavedFile = {
    id: `${hash}:${file.name}`,
    name: file.name,
    size: file.blob.size,
    type: file.blob.type,
    savedAt: Date.now(),
  };
  return transaction("readwrite", (tx, done, fail) => {
    const store = tx.objectStore("metadata");
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result as SavedFile[];
      const existing = records.find((record) => record.id === metadata.id);
      if (existing) {
        done(existing);
        return;
      }
      if (
        records.length >= COUNT_LIMIT ||
        records.reduce((sum, item) => sum + item.size, 0) + metadata.size >
          LIBRARY_LIMIT
      ) {
        fail(
          new Error(
            "Your library has reached its 200-file or 200 MB limit. Delete saved files or download this result instead.",
          ),
        );
        return;
      }
      store.put(metadata);
      tx.objectStore("contents").put(file.blob, metadata.id);
      done(metadata);
    };
  });
}
export function listFiles(): Promise<SavedFile[]> {
  return transaction("readonly", (tx, done) => {
    const request = tx.objectStore("metadata").getAll();
    request.onsuccess = () =>
      done(
        (request.result as SavedFile[]).sort((a, b) => b.savedAt - a.savedAt),
      );
  });
}
export function loadFile(id: string): Promise<Artifact> {
  return transaction("readonly", (tx, done, fail) => {
    const metadata = tx.objectStore("metadata").get(id);
    metadata.onsuccess = () => {
      if (!metadata.result) {
        fail(new Error("This file is no longer saved. Refresh the library."));
        return;
      }
      const content = tx.objectStore("contents").get(id);
      content.onsuccess = () => {
        if (!(content.result instanceof Blob)) {
          fail(
            new Error(
              "This saved file is unavailable. Restore it from your downloaded copy.",
            ),
          );
          return;
        }
        done({ name: metadata.result.name, blob: content.result });
      };
    };
  });
}
export function deleteFile(id: string): Promise<void> {
  return transaction("readwrite", (tx, done) => {
    tx.objectStore("metadata").delete(id);
    tx.objectStore("contents").delete(id);
    done();
  });
}
export function storageError(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "Your browser storage is full. Delete saved files or download this result instead.";
  if (
    error instanceof DOMException &&
    ["SecurityError", "InvalidStateError", "UnknownError"].includes(error.name)
  )
    return "This browser is blocking storage. Allow site storage or download your files instead.";
  return error instanceof Error
    ? error.message
    : "Unable to access saved files. Download a copy instead.";
}
