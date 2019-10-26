import * as path from "path";
import * as vm from "vm";
import * as ts from "@yunabe/typescript-for-tslab";
import { Converter, CompletionInfo, IsCompleteResult } from "./converter";

export interface Executor {
  /**
   * Transpiles and executes `src`.
   *
   * Note: Although this method returns a promise, `src` is executed immdiately
   * when this code is executed.
   * @param src source code to be executed.
   * @returns Whether `src` was executed successfully.
   */
  execute(src: string): Promise<boolean>;
  inspect(src: string, position: number): ts.QuickInfo;
  complete(src: string, positin: number): CompletionInfo;
  isCompleteCode(src: string): IsCompleteResult;
  reset(): void;

  /**
   * Interrupts non-blocking code execution. This method is called from SIGINT signal handler.
   * Note that blocking code execution is terminated by SIGINT separately because it is impossible
   * to call `interrupt` while `execute` is blocked.
   */
  interrupt(): void;
  locals: { [key: string]: any };

  /** Release internal resources to terminate the process gracefully. */
  close(): void;
}

export interface ConsoleInterface {
  log(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
}

/**
 * createRequire creates `require` which resolves modules from `rootDir`.
 * @param rootDir
 */
export function createRequire(rootDir: string): NodeRequire {
  // TODO: Write integration tests to test this behavior.
  const module = require("module");
  // createRequire is added in Node v12. createRequireFromPath is deprecated.
  const create = module.createRequire || module.createRequireFromPath;
  const req = create(path.join(rootDir, "tslabSrc.js"));
  return new Proxy(req, {
    // Hook require('tslab').
    // TODO: Test this behavior.
    apply: (target: object, thisArg: any, argArray?: any): any => {
      if (argArray.length == 1 && argArray[0] === "tslab") {
        return require("..");
      }
      return req.apply(thisArg, argArray);
    }
  });
}

export function createExecutor(
  rootDir: string,
  conv: Converter,
  console: ConsoleInterface
): Executor {
  const locals: { [key: string]: any } = {};
  const req = createRequire(rootDir);
  const proxyHandler: ProxyHandler<{ [key: string]: any }> = {
    get: function(_target, prop) {
      if (prop === "require") {
        return req;
      }
      if (prop === "exports") {
        return locals;
      }
      if (locals.hasOwnProperty(prop)) {
        return locals[prop as any];
      }
      return global[prop];
    }
  };
  let prevDecl = "";

  let interrupted = new Error("Interrupted asynchronously");
  let rejectInterruptPromise: (reason?: any) => void;
  let interruptPromise: Promise<void>;
  function resetInterruptPromise(): void {
    interruptPromise = new Promise((_, reject) => {
      rejectInterruptPromise = reject;
    });
    // Suppress "UnhandledPromiseRejectionWarning".
    interruptPromise.catch(() => {});
  }
  resetInterruptPromise();

  function interrupt(): void {
    rejectInterruptPromise(interrupted);
    resetInterruptPromise();
  }

  async function execute(src: string): Promise<boolean> {
    const converted = conv.convert(prevDecl, src);
    if (converted.diagnostics.length > 0) {
      for (const diag of converted.diagnostics) {
        console.error(
          "%d:%d - %s",
          diag.start.line + 1,
          diag.start.character + 1,
          diag.messageText
        );
      }
      return false;
    }
    if (!converted.output) {
      prevDecl = converted.declOutput || "";
      return true;
    }
    const context = new Proxy(locals, proxyHandler);
    try {
      // Wrap code with (function(){...}) to improve the performance (#11)
      const wrapped = "(function() { " + converted.output + "\n})()";
      vm.runInNewContext(wrapped, context, {
        breakOnSigint: true
      });
    } catch (e) {
      console.error(e);
      return false;
    }
    prevDecl = converted.declOutput || "";
    if (
      converted.lastExpressionVar &&
      locals[converted.lastExpressionVar] != null
    ) {
      let ret: any = locals[converted.lastExpressionVar];
      delete locals[converted.lastExpressionVar];
      if (ret instanceof Promise) {
        try {
          console.log(await Promise.race([ret, interruptPromise]));
        } catch (e) {
          console.error(e);
          return false;
        }
        return true;
      }
      console.log(ret);
    }
    return true;
  }

  function inspect(src: string, position: number): ts.QuickInfo {
    return conv.inspect(prevDecl, src, position);
  }

  function complete(src: string, position: number): CompletionInfo {
    return conv.complete(prevDecl, src, position);
  }

  function reset(): void {
    prevDecl = "";
    for (const name of Object.getOwnPropertyNames(locals)) {
      delete locals[name];
    }
  }

  function isCompleteCode(src: string): IsCompleteResult {
    return conv.isCompleteCode(src);
  }

  function close(): void {
    conv.close();
  }

  return {
    execute,
    inspect,
    complete,
    locals,
    reset,
    interrupt,
    isCompleteCode,
    close
  };
}
