import { randomBytes } from "crypto";
import * as jupyter from "./jupyter";

/**
 * utility functions to display rich contents
 */
export namespace display {
  export function newId(): string {
    return randomBytes(8).toString("hex");
  }
  export function javascript(s: string, id?: string): void {
    raw("text/javascript", s, id);
  }
  export function html(s: string, id?: string): void {
    raw("text/html", s, id);
  }
  export function markdown(s: string, id?: string): void {
    raw("text/markdown", s, id);
  }
  export function latex(s: string, id?: string): void {
    raw("text/latex", s, id);
  }
  export function svg(s: string, id?: string): void {
    raw("image/svg+xml", s, id);
  }
  export function png(b: Uint8Array, id?: string): void {
    raw("image/png", b, id);
  }
  export function jpeg(b: Uint8Array, id?: string): void {
    raw("image/jpeg", b, id);
  }
  export function gif(b: Uint8Array, id?: string): void {
    raw("image/gif", b, id);
  }
  export function pdf(b: Uint8Array, id?: string): void {
    raw("application/pdf", b, id);
  }
  export function text(s: string, id?: string): void {
    raw("text/plain", s, id);
  }
  export function raw(
    contentType: string,
    b: string | Uint8Array,
    id?: string
  ): void {
    if (jupyter.lastWriteDisplayData == null) {
      throw Error("Not ready");
    }
    if (!id) {
      id = newId();
    }
    jupyter.lastWriteDisplayData(
      {
        data: {
          [contentType]: b
        },
        metadata: {},
        transient: {}
      },
      true
    );
  }
}
