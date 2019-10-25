import * as child_process from "child_process";
import * as program from "commander";
import * as path from "path";
import { createConverter } from "./converter";
import { createExecutor } from "./executor";
import { JupyterHandlerImpl, ZmqServer } from "./jupyter";

export function startKernel({ configPath = "" }) {
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

export function main() {
  program.version("tslab " + require("../package.json").version);
  program
    .command("install")
    .description("Install tslab to Jupyter")
    .option("--python [python]", "Which python to install tslab", "python3")
    .option(
      "--user",
      "Install to the per-user kernels registry. Default if not root."
    )
    .option("--sys-prefix", "Which python to install tslab")
    .option("--prefix [prefix]", "Which python to install tslab")
    .action(function() {
      if (arguments.length != 1) {
        console.error(
          "Unused args:",
          Array.from(arguments).filter(arg => {
            return typeof arg === "string";
          })
        );
        process.exit(1);
      }
      let { python, user, sysPrefix, prefix } = arguments[0];
      const args = [path.join(path.dirname(__dirname), "python", "install.py")];
      if (user) {
        args.push("--user");
      }
      if (sysPrefix) {
        args.push("--sys-prefix");
      }
      if (prefix) {
        args.push(`--prefix=${prefix}`);
      }
      const cmdStr = `${python} ${args.join(" ")}`;
      console.log("Running", cmdStr);
      const ret = child_process.spawnSync(python, args, {
        stdio: "inherit"
      });
      if (ret.error) {
        console.error("Failed to spawn:", cmdStr);
        process.exit(1);
      }
      process.exit(ret.status);
    });

  program
    .command("kernel")
    .description("Start Jupyter kernel. Used from Jupyter internally")
    .option("--config-path <path>", "Path of config file")
    .action(function() {
      if (arguments.length != 1) {
        console.error(
          "Unused args:",
          Array.from(arguments).filter(arg => {
            return typeof arg === "string";
          })
        );
        process.exit(1);
      }
      let { configPath } = arguments[0];
      startKernel({ configPath });
    });

  program.parse(process.argv);
}
