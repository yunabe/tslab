import { createConverter } from "./converter";
import { createExecutor } from "./executor";
import { JupyterHandlerImpl, ZmqServer } from "./jupyter";

function main() {
  const configPath = process.argv[2];
  const converter = createConverter();
  const executor = createExecutor(converter, {
    log: console.log,
    error: console.error
  });
  const server = new ZmqServer(new JupyterHandlerImpl(executor), configPath);
  process.on("SIGINT", () => {
    executor.interrupt();
  });
  server.init();
}

main();
