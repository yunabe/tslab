import { Converter } from "./converter";
import * as vm from "vm";
import * as ts from "typescript";

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
  reset(): void;

  /**
   * Interrupts non-blocking code execution. This method is called from SIGINT signal handler.
   * Note that blocking code execution is terminated by SIGINT separately because it is impossible
   * to call `interrupt` while `execute` is blocked.
   */
  interrupt(): void;
  locals: { [key: string]: any };
}

export interface ConsoleInterface {
  log(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
}

export function createExecutor(
  conv: Converter,
  console: ConsoleInterface
): Executor {
  const locals: { [key: string]: any } = {};
  const proxyHandler: ProxyHandler<{ [key: string]: any }> = {
    get: function(_target, prop) {
      if (prop === "require") {
        // TODO: Handle the relative path import properly.
        return require;
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
    let ret: any;
    try {
      // TODO: Remove `as any` once https://github.com/DefinitelyTyped/DefinitelyTyped/pull/38859 is pushed.
      ret = vm.runInNewContext(converted.output, context, {
        breakOnSigint: true
      } as any);
    } catch (e) {
      console.error(e);
      return false;
    }
    prevDecl = converted.declOutput || "";
    if (converted.hasLastExpression && ret !== undefined) {
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

  function reset(): void {
    prevDecl = "";
    for (const name of Object.getOwnPropertyNames(locals)) {
      delete locals[name];
    }
  }

  return {
    execute,
    inspect,
    locals,
    reset,
    interrupt
  };
}
