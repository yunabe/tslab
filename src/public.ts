import { randomBytes } from "crypto";
import * as jupyter from "./jupyter";
import { getVersion } from "./util";
import * as ts from "@tslab/typescript-for-tslab";

/** This is defined to make the docstring of `versions` shorter */
interface Versions {
  tslab: string;
  typescript: string;
  node: string;
}

/** The version strings of tslab and its dependencies. */
export const versions: Versions = {
  tslab: getVersion(),
  typescript: ts.version,
  node: process.version
};

export interface Display {
  javascript(s: string): void;
  html(s: string): void;
  markdown(s: string): void;
  latex(s: string): void;
  svg(s: string): void;
  png(b: Uint8Array): void;
  jpeg(b: Uint8Array): void;
  gif(b: Uint8Array): void;
  pdf(b: Uint8Array): void;
  text(s: string): void;
  raw(contentType: string, b: string | Uint8Array);
}

/**
 * Returns a new `Display` instance which displays and overwrites a single display-entry.
 */
export function newDisplay(): Display {
  return new DisplayImpl(newDisplayId());
}

function newDisplayId(): string {
  return randomBytes(8).toString("hex");
}

class DisplayImpl {
  id?: string;
  /**
   * When `id` is set, `raw` sends `update_display_data` from the second call.
   * Notes about Jupyter spec:
   * - `update_display_data` is displayed only when `display_id` matches existing display entries.
   * - `display_data` adds a new display entry and updates existing display entries.
   */
  update?: boolean;

  constructor(id?: string) {
    this.id = id;
  }
  javascript(s: string): void {
    this.raw("text/javascript", s);
  }
  html(s: string): void {
    this.raw("text/html", s);
  }
  markdown(s: string): void {
    this.raw("text/markdown", s);
  }
  latex(s: string): void {
    this.raw("text/latex", s);
  }
  svg(s: string): void {
    this.raw("image/svg+xml", s);
  }
  png(b: Uint8Array): void {
    this.raw("image/png", b);
  }
  jpeg(b: Uint8Array): void {
    this.raw("image/jpeg", b);
  }
  gif(b: Uint8Array): void {
    this.raw("image/gif", b);
  }
  pdf(b: Uint8Array): void {
    this.raw("application/pdf", b);
  }
  text(s: string): void {
    this.raw("text/plain", s);
  }
  raw(contentType: string, b: string | Uint8Array): void {
    if (jupyter.lastWriteDisplayData == null) {
      throw Error("Not ready");
    }
    // TODO: Add a reference of this spec.
    // TODO: Test this.
    if (b instanceof Uint8Array) {
      if (!(b instanceof Buffer)) {
        b = Buffer.from(b);
      }
      b = (b as Buffer).toString("base64");
    }
    const update = this.update;
    if (this.id) {
      this.update = true;
    }
    jupyter.lastWriteDisplayData(
      {
        data: {
          [contentType]: b
        },
        metadata: {},
        transient: {
          display_id: this.id
        }
      },
      update
    );
  }
}

/**
 * Utility functions to display rich contents in tslab.
 */
export const display: Display = new DisplayImpl();
