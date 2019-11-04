import fs from "fs";
import child_process from "child_process";
import path from "path";
import program from "commander";
import { createConverter } from "./converter";
import { createExecutor, createRequire } from "./executor";
import { JupyterHandlerImpl, ZmqServer } from "./jupyter";

function* traverseAncestorDirs(
  dir: string
): Generator<{ dir: string; level: number }> {
  for (let level = 0; ; level++) {
    yield { dir, level };
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

const mainPath = ["node_modules", "tslab", "dist", "main.js"];

function findLocalStartKernel(): typeof startKernel {
  for (const { dir, level } of traverseAncestorDirs(process.cwd())) {
    if (path.basename(dir) == "node_modules") {
      continue;
    }
    if (!fs.existsSync(path.join(dir, ...mainPath))) {
      continue;
    }
    const reqPath = ["."];
    for (let i = 0; i < level; i++) {
      reqPath.push("..");
    }
    reqPath.push(...mainPath);
    const { startKernel } = createRequire(process.cwd())(reqPath.join("/"));
    return startKernel;
  }
  return null;
}

/**
 * Start the Jupyter kernel.
 *
 * This method can be imported from the globally-installed tslab (https://github.com/yunabe/tslab/issues/4),
 * whose version can be differnt from locally-installed tslab.
 * Thus, we should not rename, move or change the interface of startKernel for backward compatibiliy.
 */
export function startKernel({
  configPath = "",
  enableFindLocal = true,
  jsKernel = false
}): void {
  if (enableFindLocal) {
    const local = findLocalStartKernel();
    if (local) {
      local({ configPath, enableFindLocal: false, jsKernel });
      return;
    }
  }
  const converter = createConverter({ isJS: jsKernel });
  const executor = createExecutor(process.cwd(), converter, {
    log: console.log,
    error: console.error
  });
  const server = new ZmqServer(
    new JupyterHandlerImpl(executor, jsKernel),
    configPath
  );
  process.on("SIGINT", () => {
    executor.interrupt();
  });
  // TODO: Test these handlers.
  process.on("uncaughtException", err => {
    console.error("UncaughtException:", err);
  });
  process.on("unhandledRejection", reason => {
    console.error("UnhandledPromiseRejection:", reason);
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
    .option("--js", "If set, start JavaScript kernel. Otherwise, TypeScript.")
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
      let { configPath, js: jsKernel } = arguments[0];
      startKernel({ configPath, jsKernel });
    });

  program.parse(process.argv);
}
