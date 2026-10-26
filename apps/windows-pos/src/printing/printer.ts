/**
 * Receipt printing abstraction.
 *
 * Printing is independent of syncing: a print failure never loses or duplicates
 * a sale — the sync record keeps receipt_printed=false and the UI offers reprint.
 */
export interface Printer {
  printEscPos(bytes: Uint8Array): Promise<void>;
}

/** Inside the Tauri shell: raw bytes go to the configured printer via a Rust command. */
export class TauriPrinter implements Printer {
  async printEscPos(bytes: Uint8Array): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("print_raw", { data: Array.from(bytes) });
  }
}

/** Dev/preview printer: accepts the bytes so flows can be exercised without hardware. */
export class NullPrinter implements Printer {
  lastJob: Uint8Array | null = null;
  failNext = false;

  async printEscPos(bytes: Uint8Array): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("printer simulated failure");
    }
    this.lastJob = bytes;
  }
}

export function createPrinter(): Printer {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return new TauriPrinter();
  }
  return new NullPrinter();
}
