import { resolve } from 'path';
import { bundle } from './bundle';
import * as path from 'path';

describe('bundle', () => {
  const cwd = process.cwd();
  async function bund(entry: string, files: Map<string, string>): Promise<string> {
    const absFiles = new Map<string, string>();
    for (const [key, val] of files) {
      absFiles.set(path.join(cwd, key), val);
    }
    return await bundle(path.join(cwd, entry), absFiles);
  }

  it('import', async () => {
    const out = await bund(
      'index.js',
      new Map<string, string>([
        ['index.js', `const foo = require("./foo");console.log(foo.x);`],
        ['foo.js', 'exports.x = 10;'],
      ])
    );
    const want = ['var x = 10;', '', 'var foo = {', '\tx: x', '};', '', 'console.log(foo.x);', ''].join('\n');
    // console.log(JSON.stringify(out.split("\n")));
    expect(out).toEqual(want);
  });

  it('import default', async () => {
    const out = await bund(
      'index.js',
      new Map<string, string>([
        ['index.js', `const foo = require("./foo");console.log(foo);`],
        ['foo.js', "module.exports = 'foobarbaz';"],
      ])
    );
    const want = ["var foo = 'foobarbaz';", '', 'console.log(foo);', ''].join('\n');
    expect(out).toEqual(want);
  });

  it('NODE_ENV switch', async () => {
    // Handle NODE_ENV switch which is used in React.
    const out = await bund(
      'index.js',
      new Map<string, string>([['index.js', `if (process.env.NODE_ENV === 'production') {console.log('prod');} else {console.log('demo')}`]])
    );
    const want = "{console.log('prod');}\n";
    expect(out).toEqual(want);
  });
});
