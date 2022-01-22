import fs from 'fs';
import child_process from 'child_process';
import path from 'path';
import program from 'commander';
import { Converter, createConverter } from './converter';
import { getVersion } from './util';
import { ConverterSet, createExecutor, createRequire } from './executor';
import { JupyterHandlerImpl, ZmqServer } from './jupyter';

class ConverterSetImpl implements ConverterSet {
  private jsKernel: boolean;
  private _node: Converter;
  private _browser: Converter;

  constructor(jsKernel: boolean) {
    this.jsKernel = jsKernel;
  }
  get node(): Converter {
    if (!this._node) {
      this._node = createConverter({ isJS: this.jsKernel, isBrowser: false });
    }
    return this._node;
  }
  get browser(): Converter {
    if (!this._browser) {
      this._browser = createConverter({ isJS: this.jsKernel, isBrowser: true });
    }
    return this._browser;
  }
  close(): void {
    if (this._node) {
      this._node.close();
    }
    if (this._browser) {
      this._browser.close();
    }
  }
}

function* traverseAncestorDirs(dir: string): Generator<{ dir: string; level: number }> {
  for (let level = 0; ; level++) {
    yield { dir, level };
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
}

const mainPath = ['node_modules', 'tslab', 'dist', 'main.js'];

function findLocalStartKernel(): typeof startKernel {
  for (const { dir, level } of traverseAncestorDirs(process.cwd())) {
    if (path.basename(dir) == 'node_modules') {
      continue;
    }
    if (!fs.existsSync(path.join(dir, ...mainPath))) {
      continue;
    }
    const reqPath = ['.'];
    for (let i = 0; i < level; i++) {
      reqPath.push('..');
    }
    reqPath.push(...mainPath);
    const { startKernel } = createRequire(process.cwd())(reqPath.join('/'));
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
export function startKernel({ configPath = '', enableFindLocal = true, jsKernel = false, globalVersion = '' }): void {
  if (enableFindLocal) {
    const local = findLocalStartKernel();
    if (local) {
      local({ configPath, enableFindLocal: false, jsKernel, globalVersion });
      return;
    }
  }
  const convs = new ConverterSetImpl(jsKernel);
  convs.node; // Warm the converter for Node.js
  const executor = createExecutor(process.cwd(), convs, {
    log: console.log,
    error: console.error,
  });
  const server = new ZmqServer(new JupyterHandlerImpl(executor, jsKernel), configPath);
  process.on('SIGINT', () => {
    executor.interrupt();
  });
  // TODO: Test these handlers.
  process.on('uncaughtException', (err) => {
    console.error('UncaughtException:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('UnhandledPromiseRejection:', reason);
  });
  server.init();
}

export function main() {
  let defaultPy = 'python3';
  let defaultBinary = 'tslab';
  if (process.platform === 'win32') {
    // Windows does not have a convention to install Python3.x as python3.
    defaultPy = 'python';
    // In Windows, we need to use a batch file created by npm install.
    defaultBinary = 'tslab.cmd';
  }
  program.version('tslab ' + getVersion());
  program
    .command('install')
    .description('Install tslab to Jupyter')
    .option('--python [python]', 'Which python to install tslab kernel', defaultPy)
    .option('--binary [binary]', 'The command to start tslab', defaultBinary)
    .option('--user', 'Install to the per-user kernels registry. Default if not root')
    .option('--sys-prefix', 'Install to sys.prefix (e.g. a virtualenv or conda env)')
    .option('--prefix [prefix]', 'Kernelspec will be installed in {PREFIX}/share/jupyter/kernels/')
    .action(function () {
      if (arguments.length != 1) {
        console.error(
          'Unused args:',
          Array.from(arguments).filter((arg) => {
            return typeof arg === 'string';
          })
        );
        process.exit(1);
      }
      let { binary, python, user, sysPrefix, prefix } = arguments[0];
      const args = [path.join(path.dirname(__dirname), 'python', 'install.py')];
      args.push(`--tslab=${binary}`);
      if (user) {
        args.push('--user');
      }
      if (sysPrefix) {
        args.push('--sys-prefix');
      }
      if (prefix) {
        args.push(`--prefix=${prefix}`);
      }
      const cmdStr = `${python} ${args.join(' ')}`;
      console.log('Running', cmdStr);
      const ret = child_process.spawnSync(python, args, {
        stdio: 'inherit',
      });
      if (ret.error) {
        console.error('Failed to spawn:', cmdStr);
        process.exit(1);
      }
      process.exit(ret.status);
    });

  program
    .command('kernel')
    .description('Start Jupyter kernel. Used from Jupyter internally')
    .option('--config-path <path>', 'Path of config file')
    .option('--js', 'If set, start JavaScript kernel. Otherwise, TypeScript.')
    .action(function () {
      if (arguments.length != 1) {
        console.error(
          'Unused args:',
          Array.from(arguments).filter((arg) => {
            return typeof arg === 'string';
          })
        );
        process.exit(1);
      }
      let { configPath, js: jsKernel } = arguments[0];
      startKernel({ configPath, jsKernel, globalVersion: getVersion() });
    });

  program.parse(process.argv);
}
