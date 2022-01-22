import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import * as path from 'path';
import * as rollup from 'rollup';

function createPlugin(files: Map<string, string>): rollup.Plugin {
  function getFile(path: string): string {
    if (files.has(path)) {
      return path;
    }
    path += '.js';
    if (files.has(path)) {
      return path;
    }
    return null;
  }
  return {
    name: 'tslab-virtual',
    resolveId(source: string, importer: string): string | undefined {
      if (source.startsWith('\0')) {
        // Skip this because source is a fake module by other modules.
        return null;
      }
      if (!source.startsWith('./') && !source.startsWith('../')) {
        return getFile(source);
      }
      if (!importer) {
        return null;
      }
      return getFile(path.resolve(path.dirname(importer), source));
    },
    load(id: string): string | undefined {
      if (files.has(id)) {
        return files.get(id);
      }
    },
  };
}

// References:
// https://github.com/rollup/plugins/tree/master/packages/commonjs
// https://rollupjs.org/guide/en/
export async function bundle(entry: string, files: Map<string, string>): Promise<string> {
  const bundle = await rollup.rollup({
    input: entry,
    plugins: [
      createPlugin(files),
      resolve(),
      commonjs(),
      // c.f. https://github.com/webpack/webpack/issues/1720
      replace({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
    ],
  });
  const { output } = await bundle.generate({
    format: 'esm',
  });
  return output[0].code;
}
