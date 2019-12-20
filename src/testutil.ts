import fs from "fs";
import { randomBytes } from "crypto";
import path from "path";

export function runInTmp(prefix: string, fn: (dir: string) => void): void {
  const name = prefix + randomBytes(8).toString("hex");
  const dir = path.join("tmp", name);
  fs.mkdirSync(dir, {
    recursive: true
  });
  try {
    fn(dir);
  } finally {
    fs.rmdirSync(dir, {
      recursive: true
    });
  }
}

export async function runInTmpAsync(
  prefix: string,
  fn: (dir: string) => Promise<void>
): Promise<void> {
  const name = prefix + randomBytes(8).toString("hex");
  const dir = path.join("tmp", name);
  fs.mkdirSync(dir, {
    recursive: true
  });
  try {
    await fn(dir);
  } finally {
    fs.rmdirSync(dir, {
      recursive: true
    });
  }
}
