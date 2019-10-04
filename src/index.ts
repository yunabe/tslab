import * as path from "path";
import { createConverter } from "./converter";
import { createExecutor } from "./executor";
import { JupyterHandlerImpl, ZmqServer } from "./jupyter";

async function main() {
  const cmd = path.basename(process.argv[1]);
  let ts = false;
  if (cmd.startsWith("ts")) {
    ts = true;
  }
  const configPath = process.argv[2];
  const converter = createConverter();
  const executor = createExecutor(converter, {
    log: console.log,
    error: console.error
  });
  const server = new ZmqServer(
    new JupyterHandlerImpl(true, executor),
    configPath
  );
  process.on("SIGINT", () => {
    // Ignore SIGINT. This kernel is killed by shutdown_request.
  });
  await server.init();
}

main();
