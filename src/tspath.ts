/**
 * @file TypeScript compiler normalize paths internally by normalizeSlashes.
 * tslab needs to apply the same normalization to support Windows.
 */

import { join as nativeJoin } from 'path';

const backslashRegExp = /\\/g;

export function normalizeSlashes(path: string): string {
  return path.replace(backslashRegExp, '/');
}

export function normalizeJoin(...paths: string[]): string {
  return normalizeSlashes(nativeJoin(...paths));
}
