import * as ts from "@yunabe/typescript-for-tslab";
import { JupyterHandlerImpl, ExecuteReply } from "./jupyter";
import { Executor } from "./executor";
import { TaskCanceledError } from "./util";

describe("JupyterHandlerImpl", () => {
  let handler: JupyterHandlerImpl;
  let executor: Executor;

  // Restore stdout.write which is replaced in handleExecute.
  let origStdoutWrite = process.stdout.write;
  let origStderrWrite = process.stderr.write;

  let stdoutLog: string[] = [];
  let stderrLog: string[] = [];

  beforeEach(() => {
    executor = {} as Executor;
    handler = new JupyterHandlerImpl(executor, false);
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    stdoutLog = [];
    stderrLog = [];
  });

  function writeStream(name: string, text: string): void {
    if (name === "stderr") {
      stderrLog.push(text);
    } else {
      stdoutLog.push(text);
    }
  }

  it("handleKernel", () => {
    expect(handler.handleKernel()).toEqual({
      protocol_version: "5.3",
      implementation: "tslab",
      implementation_version: "1.0.0",
      language_info: {
        name: "typescript",
        version: "3.7.2",
        mimetype: "text/typescript",
        file_extension: ".ts",
        codemirror_mode: {
          mode: "typescript",
          name: "javascript",
          typescript: true
        }
      },
      banner: "TypeScript"
    });
  });

  it("handleJsKernel", () => {
    handler = new JupyterHandlerImpl(executor, true);
    expect(handler.handleKernel()).toEqual({
      protocol_version: "5.3",
      implementation: "jslab",
      implementation_version: "1.0.0",
      language_info: {
        name: "javascript",
        version: "",
        mimetype: "text/javascript",
        file_extension: ".js"
      },
      banner: "JavaScript"
    });
  });

  it("handleInspect", () => {
    const want: ts.QuickInfo = {
      displayParts: [
        {
          kind: "keyword",
          text: "let"
        },
        {
          kind: "space",
          text: " "
        },
        {
          kind: "localName",
          text: "xyz"
        }
      ],
      documentation: [
        {
          kind: "text",
          text: "xys is a great variable"
        }
      ],
      kind: ts.ScriptElementKind.letElement,
      kindModifiers: "",
      tags: undefined,
      textSpan: {
        length: 3,
        // TODO: Cancel the length of prefix.
        start: 10
      }
    };
    executor.inspect = () => want;
    const reply = handler.handleInspect({
      code: "",
      cursor_pos: 0,
      detail_level: 0
    });
    expect(reply).toEqual({
      status: "ok",
      found: true,
      data: { "text/plain": "let xyz\n\nxys is a great variable" },
      metadata: {}
    });
  });

  it("handleExecute", async () => {
    executor.execute = async (src: string) => {
      if (src === "0") {
        return true;
      }
      if (src === "1") {
        return false;
      }
      if (src === "2") {
        throw new TaskCanceledError(null);
      }
      throw new Error("unexpected src: " + src);
    };
    let reply: ExecuteReply;
    reply = await handler.handleExecute(
      {
        code: "0",
        silent: false,
        store_history: false,
        user_expressions: {}
      },
      null,
      null
    );
    reply = await handler.handleExecute(
      {
        code: "1",
        silent: false,
        store_history: false,
        user_expressions: {}
      },
      writeStream,
      null
    );
    expect(reply).toEqual({ execution_count: 2, status: "error" });
    reply = await handler.handleExecute(
      {
        code: "2",
        silent: false,
        store_history: false,
        user_expressions: {}
      },
      writeStream,
      null
    );
    expect(reply).toEqual({ execution_count: undefined, status: "abort" });
    reply = await handler.handleExecute(
      {
        code: "unknown",
        silent: false,
        store_history: false,
        user_expressions: {}
      },
      writeStream,
      null
    );
    expect(reply).toEqual({ execution_count: undefined, status: "error" });
    // TODO: Figure out why this message is recorded to stdout.
    expect(stdoutLog.join("")).toContain(
      "unexpected error: Error: unexpected src: unknown"
    );
    expect(stderrLog).toEqual([]);
  });
});
