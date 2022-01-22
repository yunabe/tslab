/**
 * @file Lightweight utilities. Don't import other libraries to keep this light because this is imported from main.ts,
 * which may just invoke locally-installed tslab.
 */

/** A cache of version read from package.json */
let versionCache: string = null;

/**
 * Get the version string of tslab from package.json.
 */
export function getVersion(): string {
  if (versionCache == null) {
    versionCache = require('../package.json').version;
  }
  return versionCache;
}

export function isValidModuleName(name: string): boolean {
  return /^\w+$/.test(name);
}

/**
 * TaskQueue executes asynchronous tasks sequentially.
 */
export class TaskQueue {
  private prev: Promise<any>;

  constructor() {
    this.prev = Promise.resolve();
  }

  /**
   * Adds a new task to the queue.
   *
   * `fn` is not executed immediately even if the queue is empty.
   * Unhandled rejections of promises are not recognized as `UnhandledPromiseRejection`
   * when rejected promises have a subsequent task.
   *
   * @param fn A function executed in this queue.
   */
  add<T>(fn: () => Promise<T>): Promise<T> {
    let promise = this.prev.then(fn, (reason) => {
      if (reason instanceof TaskCanceledError) {
        // Avoid unnecessary deep nesting.
        throw reason;
      }
      throw new TaskCanceledError(reason);
    });
    this.prev = promise;
    return promise;
  }

  reset(delay?: number): void {
    if (delay == null) {
      this.prev = Promise.resolve();
      return;
    }
    setTimeout(() => {
      this.reset();
    }, delay);
  }
}

export class TaskCanceledError extends Error {
  /** The root cause of this cancellation. */
  public reason: any;

  constructor(reason: any) {
    super(reason);
    this.name = 'TaskCanceledError';
    this.reason = reason;
  }
}

export function escapeHTML(s: string): string {
  /*`&`, "&amp;",
	`'`, "&#39;", // "&#39;" is shorter than "&apos;" and apos was not in HTML until HTML5.
	`<`, "&lt;",
	`>`, "&gt;",
  `"`, "&#34;",
  */
  return s.replace(/[&'<>"]/g, (m) => {
    switch (m) {
      case '&':
        return '&amp;';
      case "'":
        return '&#39;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&#34;';
    }
    // must not happen
    return m;
  });
}
