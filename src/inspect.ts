/**
 * getQuickInfoAtPosition and necessary functions cloned from TypeScript services.ts.
 * TODO: Use TypeScript or branched TypeScript library instead of copying these functions.
 */

import * as ts from '@tslab/typescript-for-tslab';

export function printQuickInfo(info: ts.QuickInfo): string {
  let out = [];
  const parts = info.displayParts || [];
  const docs = info.documentation || [];
  const tags = info.tags || [];
  for (const part of parts) {
    out.push(part.text);
  }
  if (out.length > 0 && (docs.length > 0 || tags.length > 0)) {
    out.push('\n');
  }
  for (const doc of docs) {
    out.push('\n');
    out.push(doc.text);
  }
  for (const tag of tags) {
    let text = tag.text;
    if (tag.name === 'param') {
      text = '@param ' + text;
    }
    out.push('\n');
    out.push(text);
  }
  return out.join('');
}
