/**
 * @file Define a function to parse metadat of codeblock in tslab.
 */

import { isValidModuleName } from "./util";
import * as ts from "@tslab/typescript-for-tslab";

export interface CodeMetadata {
  mode?: "node" | "browser";
  module?: string;
  jsx?: true;
}

export function getCodeMetadata(src: string): CodeMetadata {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false
  );
  scanner.setLanguageVariant(ts.LanguageVariant.Standard);
  scanner.setText(src);
  const out: CodeMetadata = {};
  while (true) {
    const kind = scanner.scan();
    if (
      kind < ts.SyntaxKind.FirstTriviaToken ||
      kind > ts.SyntaxKind.LastTriviaToken
    ) {
      break;
    }
    if (kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      // Skip trivia tokens.
      continue;
    }
    const text = scanner.getTokenText();
    const ret = (ts as any).parseIsolatedJSDocComment(text);
    if (!ret) {
      // Not JSDoc (e.g. /* comment */)
      continue;
    }
    if (ret.diagnostics?.length) {
      continue;
    }
    const jsDoc = ret.jsDoc;
    if (!jsDoc || !jsDoc.tags) {
      continue;
    }
    for (const tag of jsDoc.tags as ts.JSDocTag[]) {
      const tagName = tag.tagName.escapedText;
      if (tagName === "module" && isValidModuleName(tag.comment)) {
        out.module = tag.comment;
      } else if (tagName === "jsx") {
        out.jsx = true;
      } else if (tagName === "node") {
        out.mode = "node";
      } else if (tagName === "browser") {
        out.mode = "browser";
      }
    }
  }
  return out;
}
