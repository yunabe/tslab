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
    let promise = this.prev.then(fn, reason => {
      if (reason instanceof TaskCanceledError) {
        // Avoid unnecessary deep nesting.
        throw reason;
      }
      throw new TaskCanceledError(reason);
    });
    this.prev = promise;
    return promise;
  }
}

export class TaskCanceledError extends Error {
  /** The root cause of this cancellation. */
  public reason: any;

  constructor(reason: any) {
    super(reason);
    this.name = "TaskCanceledError";
    this.reason = reason;
  }
}
