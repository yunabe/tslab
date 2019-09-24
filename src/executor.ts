import { Converter, ConvertResult } from "./converter";
import * as vm from "vm";

export interface Executor {
  execute(src: string): void;
  reset(): void;
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

  function execute(src: string) {
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
      return;
    }
    if (!converted.output) {
      return;
    }
    const context = new Proxy(locals, proxyHandler);
    let ret = vm.runInNewContext(converted.output, context);
    if (converted.hasLastExpression && ret !== undefined) {
      console.log(ret);
    }
    prevDecl = converted.declOutput || "";
  }

  function reset(): void {
    prevDecl = "";
    for (const name of Object.getOwnPropertyNames(locals)) {
      delete locals[name];
    }
  }

  return {
    execute,
    locals,
    reset
  };
}
