/**
 * @fileoverview Test JavaScript mode
 */

import * as converter from './converter';
import { printQuickInfo } from './inspect';

// TODO: Test inspect and complete.

let conv: converter.Converter;
beforeAll(() => {
  conv = converter.createConverter({ isJS: true });
});
afterAll(() => {
  if (conv) {
    conv.close();
  }
});

function buildOutput(
  lines: string[],
  opts?: {
    noEsModule?: boolean;
  }
): string {
  const out: string[] = [];
  if (!opts || !opts.noEsModule) {
    out.push('Object.defineProperty(exports, "__esModule", { value: true });');
  }
  out.push(...lines);
  out.push('');
  return out.join('\n');
}

describe('convert', () => {
  it('variables', () => {
    const out = conv.convert('', `let x = 123; const y = 'foo'; var z = true;`);
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        'exports.z = exports.y = exports.x = void 0;',
        'let x = 123;',
        'exports.x = x;',
        "const y = 'foo';",
        'exports.y = y;',
        'var z = true;',
        'exports.z = z;',
      ])
    );
    expect(out.declOutput).toEqual(['export let x: number;', 'export const y: "foo";', 'export var z: boolean;', ''].join('\n'));
  });

  it('functions', () => {
    const out = conv.convert(
      '',
      `
        function sum(x, y) {
          return x + y;
        }
        function* xrange(n) {
          for (let i = 0; i < n; i++) {
            yield i;
          }
        }
        async function sleep(ms) {
          return new Promise(resolve => {
            setTimeout(resolve, ms);
          });
        }
        `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        'exports.sleep = exports.xrange = exports.sum = void 0;',
        'function sum(x, y) {',
        '    return x + y;',
        '}',
        'exports.sum = sum;',
        'function* xrange(n) {',
        '    for (let i = 0; i < n; i++) {',
        '        yield i;',
        '    }',
        '}',
        'exports.xrange = xrange;',
        'async function sleep(ms) {',
        '    return new Promise(resolve => {',
        '        setTimeout(resolve, ms);',
        '    });',
        '}',
        'exports.sleep = sleep;',
      ])
    );
    expect(out.declOutput).toEqual(
      [
        'export function sum(x: any, y: any): any;',
        'export function xrange(n: any): Generator<number, void, unknown>;',
        'export function sleep(ms: any): Promise<any>;',
        '',
      ].join('\n')
    );
  });

  it('jsdoc type', () => {
    // TypeScript uses JSDoc to infer types.
    const out = conv.convert(
      '',
      `
      /** @type {any} */
      let x = 10;
      x = 'hello';
      /**
       * @param {number} x
       * @param {number} y
       */
      function sum(x, y) {
        return x + y;
      }
      `
    );
    expect(out.output).toEqual(
      buildOutput([
        'exports.x = exports.sum = void 0;',
        '/** @type {any} */',
        'let x = 10;',
        'exports.x = x;',
        "exports.x = x = 'hello';",
        '/**',
        ' * @param {number} x',
        ' * @param {number} y',
        ' */',
        'function sum(x, y) {',
        '    return x + y;',
        '}',
        'exports.sum = sum;',
      ])
    );
    expect(out.declOutput).toEqual(
      [
        '/**',
        ' * @param {number} x',
        ' * @param {number} y',
        ' */',
        'export function sum(x: number, y: number): number;',
        '/** @type {any} */',
        'export let x: any;',
        '',
      ].join('\n')
    );
  });

  it('syntax error', () => {
    const out = conv.convert('', `let x: number = 10;`);
    expect(out.diagnostics).toEqual([
      {
        start: { offset: 7, line: 0, character: 7 },
        end: { offset: 13, line: 0, character: 13 },
        messageText: 'Type annotations can only be used in TypeScript files.',
        category: 1,
        code: 8010,
      },
    ]);
  });

  it('type error', () => {
    const out = conv.convert('', `let x = 10; x = 'hello';`);
    expect(out.diagnostics).toEqual([
      {
        start: { offset: 12, line: 0, character: 12 },
        end: { offset: 13, line: 0, character: 13 },
        messageText: "Type 'string' is not assignable to type 'number'.",
        category: 1,
        code: 2322,
      },
    ]);
  });
});

function complete(prevDecl: string, src: string): converter.CompletionInfo {
  return conv.complete(prevDecl, src.replace('[cur]', ''), src.indexOf('[cur]'));
}

describe('complete', () => {
  it('members', () => {
    const src = `let v = { abc: "hello", xyz: 10 }; v.[cur]`;
    const info = complete('', src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: ['abc', 'xyz'],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: 'abc', kind: 'property', kindModifiers: '', sortText: '1' },
          { name: 'xyz', kind: 'property', kindModifiers: '', sortText: '1' },
        ],
      },
    });
  });
});

describe('inspect', () => {
  it('let number', () => {
    const src = '/** xys is a great variable */\nlet xyz = 10;';
    const info = conv.inspect(``, src, src.indexOf('xyz ='));
    expect(printQuickInfo(info)).toEqual(['let xyz: number', '', 'xys is a great variable'].join('\n'));
  });
});
