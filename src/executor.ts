import { Converter, ConvertResult } from "./converter";
import * as vm from "vm";

export interface Executor {
  execute(src: string): void;
  reset(): void;
  locals: { [key: string]: any };
}

export function createExecutor(conv: Converter): Executor {
  const locals: { [key: string]: any } = {};
  let context = new Proxy(locals, {
    get: function(_target, prop) {
      if (locals.hasOwnProperty(prop)) {
        return locals[prop as any];
      }
      return global[prop];
    }
  });
  vm.createContext(context);
  let prevDecl = "";
  function execute(src: string) {
    const converted = conv.convert(prevDecl, src);
    if (converted.diagnostics.length > 0) {
      console.error(converted.diagnostics.join("\n"));
      return;
    }
    if (!converted.output) {
      return;
    }
    vm.runInContext(
      `(function(exports){
${converted.output}
}(this))`,
      context
    );
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
