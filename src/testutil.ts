import { randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import ts from "@tslab/typescript-for-tslab";
import * as converter from "./converter";
import { normalizeJoin } from "./tspath";

export function runInTmp(prefix: string, fn: (dir: string) => void): void {
  const name = prefix + randomBytes(8).toString("hex");
  const dir = normalizeJoin("tmp", name);
  fs.mkdirSync(dir, {
    recursive: true,
  });
  try {
    fn(dir);
  } finally {
    fs.rmdirSync(dir, {
      recursive: true,
    });
  }
}

export async function runInTmpAsync(
  prefix: string,
  fn: (dir: string) => Promise<void>
): Promise<void> {
  const name = prefix + randomBytes(8).toString("hex");
  const dir = normalizeJoin("tmp", name);
  fs.mkdirSync(dir, {
    recursive: true,
  });
  try {
    await fn(dir);
  } finally {
    fs.rmdirSync(dir, {
      recursive: true,
    });
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type WaitFileEventFunc = (
  fileName?: string,
  eventKind?: ts.FileWatcherEventKind
) => Promise<{ fileName: string; eventKind: ts.FileWatcherEventKind }>;

export function createConverterWithFileWatcher(): {
  converter: converter.Converter;
  waitFileEvent: WaitFileEventFunc;
} {
  let fileWathchers = new Set<ts.FileWatcherCallback>();
  let conv = converter.createConverter({
    _fileWatcher: (fileName, eventKind) => {
      fileWathchers.forEach((cb) => cb(fileName, eventKind));
    },
  });
  function waitFileEvent(
    fileName?: string,
    eventKind?: ts.FileWatcherEventKind
  ): Promise<{ fileName: string; eventKind: ts.FileWatcherEventKind }> {
    return new Promise((done) => {
      const cb = (fn, ek) => {
        if (
          (fileName == null || fileName === fn) &&
          (eventKind == null || eventKind === ek)
        ) {
          fileWathchers.delete(cb);
          done({ fileName: fn, eventKind: ek });
        }
      };
      fileWathchers.add(cb);
    });
  }
  return { converter: conv, waitFileEvent };
}

/**
 * It seems like ts.sys.watchFile is not working on Mac. See
 * https://github.com/yunabe/typescript-filewatch-mac-bug
 * @returns True if ts.sys.watchFile is broken in the current environment.
 */
export function isTsWatchBroken(): boolean {
  return os.platform() === "darwin" && process.env.GITHUB_ACTIONS === "true";
}

/**
 * Performance tests on Mac eivnronment on GitHub Actions sometimes fail.
 * @returns
 */
export function isPerformanceUnstableEnv(): boolean {
  return os.platform() === "darwin" && process.env.GITHUB_ACTIONS === "true";
}
