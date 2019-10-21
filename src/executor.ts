import { Converter, CompletionInfo } from "./converter";
import * as vm from "vm";
import * as ts from "@yunabe/typescript-for-tslab";

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

function requireImpl(id: string): any {
  if (id === "tslab") {
    return require("..");
  }
  // require must not be bound to this file. require resolve
  // relative paths using the caller context (`this`).
  // Thus, we can use require from everywhere.
  // In vm, require is called with global and relative paths are resolved
  // from the current directory.
  // TODO: Test this behavior.
  return require.call(this, id);
}

export function createExecutor(
  conv: Converter,
  console: ConsoleInterface
): Executor {
  const locals: { [key: string]: any } = {};
  const proxyHandler: ProxyHandler<{ [key: string]: any }> = {
    get: function(_target, prop) {
      if (prop === "require") {
        return requireImpl;
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
    close
  };
}
