import * as fs from "fs";
import * as path from "path";
import { promisify, TextDecoder } from "util";

import * as zmq from "zeromq";
import { createHmac } from "crypto";

import { Converter, createConverter } from "./converter";
import { Executor, createExecutor } from "./executor";
import { printQuickInfo } from "./inspect";

const utf8Decoder = new TextDecoder();

interface ConnectionInfo {
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
  ip: string;
  key: string;
  transport: string;
  signature_scheme: string;
  kernel_name: string;
}

interface HeaderMessage {
  version: string;
  date: string;
  session: string;
  username: string;
  msg_type: string;
  msg_id: string;
}

interface KernelInfoReply {
  /**
   * Version of messaging protocol.
   * The first integer indicates major version.  It is incremented when
   * there is any backward incompatible change.
   * The second integer indicates minor version.  It is incremented when
   * there is any backward compatible change.
   */
  protocol_version: string;

  /**
   * The kernel implementation name
   * (e.g. 'ipython' for the IPython kernel)
   */
  implementation: string;

  /**
   * Implementation version number.
   * The version number of the kernel's implementation
   * (e.g.IPython.__version__ for the IPython kernel)
   */
  implementation_version: string;

  /**
   * Information about the language of code for the kernel
   */
  language_info: {
    /**
     * Name of the programming language that the kernel implements.
     * Kernel included in IPython returns 'python'.
     */
    name: string;

    /**
     * Language version number.
     * It is Python version number(e.g., '2.7.3') for the kernel
     * included in IPython.
     */
    version: string;

    /**
     * mimetype for script files in this language
     */
    mimetype: string;

    /** Extension including the dot, e.g. '.py' */
    file_extension: string;

    /**
     * Pygments lexer, for highlighting
     * Only needed if it differs from the 'name' field.
     */
    pygments_lexer?: string;

    /**
     * Codemirror mode, for for highlighting in the notebook.
     * Only needed if it differs from the 'name' field.
     */
    codemirror_mode?: string | Object;

    /**
     * Nbconvert exporter, if notebooks written with this kernel should
     * be exported with something other than the general 'script'
     * exporter.
     */
    nbconvert_exporter?: string;
  };

  /**
   * A banner of information about the kernel,
   * which may be desplayed in console environments.
   */
  banner: string;

  /**
   * Optional: A list of dictionaries, each with keys 'text' and 'url'.
   * These will be displayed in the help menu in the notebook UI.
   */
  help_links?: [{ text: string; url: string }];
}

interface ExecuteRequest {
  /**Source code to be executed by the kernel, one or more lines. */
  code: string;

  /**
   * A boolean flag which, if True, signals the kernel to execute
   * this code as quietly as possible.
   * silent=True forces store_history to be False,
   * and will *not*:
   *   - broadcast output on the IOPUB channel
   *   - have an execute_result
   * The default is False.
   */
  silent: boolean;

  /*
   * A boolean flag which, if True, signals the kernel to populate history
   * The default is True if silent is False.  If silent is True, store_history
   * is forced to be False.
   */
  store_history: boolean;

  /**
   * A dict mapping names to expressions to be evaluated in the
   * user's dict. The rich display-data representation of each will be evaluated after execution.
   * See the display_data content for the structure of the representation data.
   */
  user_expressions: Object;

  /**
   * Some frontends do not support stdin requests.
   * If this is true, code running in the kernel can prompt the user for input
   * with an input_request message (see below). If it is false, the kernel
   * should not send these messages.
   */
  allow_stdin?: boolean;

  /**
   * A boolean flag, which, if True, does not abort the execution queue, if an exception is encountered.
   * This allows the queued execution of multiple execute_requests, even if they generate exceptions.
   */
  stop_on_error?: boolean;
}

interface ExecuteReply {
  /** One of: 'ok' OR 'error' OR 'abort' */
  status: string;

  /**
   * The global kernel counter that increases by one with each request that
   * stores history.  This will typically be used by clients to display
   * prompt numbers to the user.  If the request did not store history, this will
   * be the current value of the counter in the kernel.
   */
  execution_count: number;

  /**
   * 'payload' will be a list of payload dicts, and is optional.
   * payloads are considered deprecated.
   * The only requirement of each payload dict is that it have a 'source' key,
   * which is a string classifying the payload (e.g. 'page').
   */
  payload?: Object[];

  /** Results for the user_expressions. */
  user_expressions?: Object;
}

interface IsCompleteRequest {
  /** The code entered so far as a multiline string */
  code: string;
}

interface IsCompleteReply {
  /** One of 'complete', 'incomplete', 'invalid', 'unknown' */
  status: "complete" | "incomplete" | "invalid" | "unknown";

  /**
   * If status is 'incomplete', indent should contain the characters to use
   * to indent the next line. This is only a hint: frontends may ignore it
   * and use their own autoindentation rules. For other statuses, this
   * field does not exist.
   */
  indent?: string;
}

interface InspectRequest {
  /**
   * The code context in which introspection is requested
   * this may be up to an entire multiline cell.
   */
  code: string;

  /**
   * The cursor position within 'code' (in unicode characters) where inspection is requested
   */
  cursor_pos: number;

  /**
   *
   * The level of detail desired.  In IPython, the default (0) is equivalent to typing
   * 'x?' at the prompt, 1 is equivalent to 'x??'.
   * The difference is up to kernels, but in IPython level 1 includes the source code
   * if available.
   */
  detail_level: 0 | 1;
}

interface InspectReply {
  /** 'ok' if the request succeeded or 'error', with error information as in all other replies. */
  status: "ok";

  /** found should be true if an object was found, false otherwise */
  found: boolean;

  /** data can be empty if nothing is found */
  data: { [key: string]: string };
  metadata: { [key: string]: never };
}

interface ShutdownRequest {
  /**
   * False if final shutdown, or True if shutdown precedes a restart
   */
  restart: boolean;
}

interface ShutdownReply {
  /**
   * False if final shutdown, or True if shutdown precedes a restart
   */
  restart: boolean;
}

class ZmqMessage {
  // identity must not string because jupyter sends non-string identity since 5.3 prototocol.
  // TODO: Check this is an intentional change in Jupyter.
  identity: Buffer;
  delim: string;
  hmac: string;
  header: HeaderMessage;
  parent: HeaderMessage;
  metadata: Object;
  content: Object;
  extra: Buffer[];

  private constructor() {}

  private static verifyHmac(key: string, hmac: string, rest: Buffer[]) {
    const hash = createHmac("sha256", key);
    for (const r of rest) {
      hash.update(r);
    }
    const hex = hash.digest("hex");
    if (hex == hmac) {
      return;
    }
    throw new Error(`invalid hmac ${hmac}; want ${hex}`);
  }

  static fromRaw(key: string, raw: Buffer[]): ZmqMessage {
    const ret = new ZmqMessage();
    ret.identity = raw[0];
    ret.delim = raw[1].toString();
    ret.hmac = raw[2].toString();
    ret.header = JSON.parse(raw[3].toString());
    ret.parent = JSON.parse(raw[4].toString());
    ret.metadata = JSON.parse(raw[5].toString());
    ret.content = JSON.parse(raw[6].toString());
    ret.extra = raw.slice(7);
    ZmqMessage.verifyHmac(key, ret.hmac, raw.slice(3));
    return ret;
  }

  createReply(): ZmqMessage {
    const rep = new ZmqMessage();
    // https://github.com/ipython/ipykernel/blob/master/ipykernel/kernelbase.py#L222
    // idents must be copied from the parent.
    rep.identity = this.identity;
    rep.delim = this.delim;
    // Sets an empty string to hmac because it won't be used.
    rep.hmac = "";
    rep.header = {
      version: "5.3",
      date: new Date().toISOString(),
      session: this.header.session,
      username: this.header.username,
      msg_type: this.header.msg_type,
      msg_id: this.header.msg_id
    };
    rep.parent = this.header;
    rep.metadata = {};
    rep.content = {};
    rep.extra = [];
    return rep;
  }

  signAndSend(key: string, sock) {
    const heads: (string | Buffer)[] = [];
    heads.push(this.identity);
    heads.push(this.delim);
    const bodies: string[] = [];
    bodies.push(JSON.stringify(this.header));
    bodies.push(JSON.stringify(this.parent));
    bodies.push(JSON.stringify(this.metadata));
    bodies.push(JSON.stringify(this.content));
    for (const e of this.extra) {
      bodies.push(JSON.stringify(e));
    }

    const hash = createHmac("sha256", key);
    for (const b of bodies) {
      hash.update(b);
    }
    heads.push(hash.digest("hex"));
    const raw = heads.concat(bodies);
    sock.send(raw);
  }
}

interface JupyterHandler {
  handleKernel(): KernelInfoReply;
  handleExecute(req: ExecuteRequest): ExecuteReply;
  handleIsComplete(req: IsCompleteRequest): IsCompleteReply;
  handleInspect(req: InspectRequest): InspectReply;
  handleShutdown(req: ShutdownRequest): ShutdownReply;
}

class JupyterHandlerImpl implements JupyterHandler {
  private ts: boolean;

  private execCount: number = 0;
  private converter: Converter = null;
  private executor: Executor = null;

  constructor(ts: boolean) {
    this.ts = ts;
    this.converter = createConverter();
    this.executor = createExecutor(this.converter, {
      log: console.log,
      error: console.error
    });
  }

  handleKernel(): KernelInfoReply {
    return {
      protocol_version: "5.3",
      implementation: this.ts ? "tslab" : "jslab",
      implementation_version: "1.0.0",
      language_info: {
        name: "javascript",
        version: "",
        mimetype: "",
        file_extension: this.ts ? ".ts" : ".js"
      },
      banner: "TypeScript"
    };
  }

  handleExecute(req: ExecuteRequest): ExecuteReply {
    this.executor.execute(req.code);
    return {
      status: "ok",
      execution_count: ++this.execCount
    };
  }

  handleIsComplete(req: IsCompleteRequest): IsCompleteReply {
    return {
      status: "complete"
    };
  }

  handleInspect(req: InspectRequest): InspectReply {
    const info = this.executor.inspect(req.code, req.cursor_pos);
    if (!info) {
      return {
        status: "ok",
        found: false,
        data: {},
        metadata: {}
      };
    }
    let text = printQuickInfo(info);
    return {
      status: "ok",
      found: true,
      data: {
        // text/plain must be filled even if "text/html" is provided.
        // TODO: Fill text/html too if necessary.
        "text/plain": text
      },
      metadata: {}
    };
  }

  handleShutdown(req: ShutdownRequest): ShutdownReply {
    this.converter.close();
    return {
      restart: false
    };
  }
}

class ZmqServer {
  handler: JupyterHandler;
  configPath: string;
  connInfo: ConnectionInfo;

  iopub: any;

  constructor(handler: JupyterHandler, configPath: string) {
    this.handler = handler;
    this.configPath = configPath;
  }

  private bindSocket(sock, port: number) {
    const conn = this.connInfo;
    const addr = `${conn.transport}://${conn.ip}:${port}`;
    return promisify(sock.bind).bind(sock)(addr);
  }

  publishStatus(status: string, parent: ZmqMessage) {
    const reply = parent.createReply();
    reply.content = {
      execution_state: status
    };
    reply.header.msg_type = "status";
    reply.signAndSend(this.connInfo.key, this.iopub);
  }

  async handleShellMessage(sock, ...args: Buffer[]) {
    const msg = ZmqMessage.fromRaw(this.connInfo.key, args);
    this.publishStatus("busy", msg);
    try {
      switch (msg.header.msg_type) {
        case "kernel_info_request":
          this.handleKernelInfo(sock, msg);
          break;
        case "execute_request":
          await this.handleExecute(sock, msg);
          break;
        case "is_complete_request":
          this.handleIsComplete(sock, msg);
          break;
        case "inspect_request":
          this.handleInspect(sock, msg);
          break;
        case "shutdown_request":
          this.handleShutdown(sock, msg);
          break;
        default:
          console.warn(`unknown msg_type: ${msg.header.msg_type}`);
      }
    } finally {
      this.publishStatus("idle", msg);
    }
  }

  handleKernelInfo(sock, msg: ZmqMessage) {
    const reply = msg.createReply();
    reply.header.msg_type = "kernel_info_reply";
    reply.content = this.handler.handleKernel();
    reply.signAndSend(this.connInfo.key, sock);
  }

  async handleExecute(sock, msg: ZmqMessage) {
    const reply = msg.createReply();
    reply.header.msg_type = "execute_reply";
    // Python kernel forward outputs to the cell even after the execution is finished.
    // We follow the same convension here.
    process.stdout.write = this.createWriteToIopub(msg, "stdout") as any;
    process.stderr.write = this.createWriteToIopub(msg, "stderr") as any;
    reply.content = this.handler.handleExecute(msg.content as ExecuteRequest);
    reply.signAndSend(this.connInfo.key, sock);
  }

  handleIsComplete(sock, msg: ZmqMessage) {
    const reply = msg.createReply();
    reply.header.msg_type = "is_complete_reply";
    reply.content = this.handler.handleIsComplete(
      msg.content as IsCompleteRequest
    );
    reply.signAndSend(this.connInfo.key, sock);
  }

  handleInspect(sock, msg: ZmqMessage) {
    const reply = msg.createReply();
    reply.header.msg_type = "inspect_reply";
    reply.content = this.handler.handleInspect(msg.content as InspectRequest);
    reply.signAndSend(this.connInfo.key, sock);
  }

  handleShutdown(sock, msg: ZmqMessage) {
    const reply = msg.createReply();
    reply.header.msg_type = "shutdown_reply";
    reply.content = this.handler.handleShutdown(msg.content as ShutdownRequest);
    reply.signAndSend(this.connInfo.key, sock);
  }

  createWriteToIopub(parent: ZmqMessage, name: "stdout" | "stderr") {
    return (buffer: string | Uint8Array, encoding?: string): boolean => {
      let text: string;
      if (typeof buffer === "string") {
        text = buffer;
      } else {
        text = utf8Decoder.decode(buffer);
      }
      const reply = parent.createReply();
      reply.header.msg_type = "stream";
      reply.content = {
        name,
        text
      };
      reply.signAndSend(this.connInfo.key, this.iopub);
      return true;
    };
  }

  async init() {
    const cinfo: ConnectionInfo = JSON.parse(
      await fs.promises.readFile(this.configPath, "utf-8")
    );
    this.connInfo = cinfo;

    // http://zeromq.github.io/zeromq.js/
    this.iopub = zmq.socket("pub");
    const shell = zmq.socket("router");
    shell.on("message", this.handleShellMessage.bind(this, shell));
    const control = zmq.socket("router");
    control.on("message", this.handleShellMessage.bind(this, control));
    const stdin = zmq.socket("router");
    const hb = zmq.socket("rep");
    hb.on("message", function(...args) {
      // console.log('hb args', args);
      hb.send(args);
    });

    this.bindSocket(this.iopub, cinfo.iopub_port);
    this.bindSocket(shell, cinfo.shell_port);
    this.bindSocket(control, cinfo.control_port);
    this.bindSocket(stdin, cinfo.stdin_port);
    this.bindSocket(hb, cinfo.hb_port);
  }
}

async function main() {
  const cmd = path.basename(process.argv[1]);
  let ts = false;
  if (cmd.startsWith("ts")) {
    ts = true;
  }

  const configPath = process.argv[2];
  const server = new ZmqServer(new JupyterHandlerImpl(true), configPath);
  await server.init();
}

main();
