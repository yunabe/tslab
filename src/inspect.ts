/**
 * getQuickInfoAtPosition and necessary functions cloned from TypeScript services.ts.
 * TODO: Use TypeScript or branched TypeScript library instead of copying these functions.
 */

import * as ts from "typescript";

function shouldGetType(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  position: number
): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.Identifier:
      return !(ts as any).isLabelName(node) && !(ts as any).isTagName(node);
    case ts.SyntaxKind.PropertyAccessExpression:
    case ts.SyntaxKind.QualifiedName:
      // Don't return quickInfo if inside the comment in `a/**/.b`
      return !(ts as any).isInComment(sourceFile, position);
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.ThisType:
    case ts.SyntaxKind.SuperKeyword:
      return true;
    default:
      return false;
  }
}

function getNodeForQuickInfo(node: ts.Node): ts.Node {
  if (ts.isNewExpression(node.parent) && node.pos === node.parent.pos) {
    return node.parent.expression;
  }
  return node;
}

function getSymbolAtLocationForQuickInfo(
  node: ts.Node,
  checker: ts.TypeChecker
): ts.Symbol | undefined {
  const object = (ts as any).getContainingObjectLiteralElement(node);
  if (object) {
    const contextualType = checker.getContextualType(object.parent);
    const properties =
      contextualType &&
      (ts as any).getPropertySymbolsFromContextualType(
        object,
        checker,
        contextualType,
        /*unionSymbolOk*/ false
      );
    if (properties && properties.length === 1) {
      return properties[0];
    }
  }
  return checker.getSymbolAtLocation(node);
}

const cancellationToken: ts.CancellationToken = {
  isCancellationRequested: (): boolean => false,
  throwIfCancellationRequested: (): void => {}
};

export function getQuickInfoAtPosition(
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  position: number
): ts.QuickInfo | undefined {
  const node = (ts as any).getTouchingPropertyName(sourceFile, position);
  if (node === sourceFile) {
    // Avoid giving quickInfo for the sourceFile as a whole.
    return undefined;
  }

  const nodeForQuickInfo = getNodeForQuickInfo(node);
  const symbol = getSymbolAtLocationForQuickInfo(nodeForQuickInfo, typeChecker);

  if (!symbol || typeChecker.isUnknownSymbol(symbol)) {
    const type = shouldGetType(sourceFile, nodeForQuickInfo, position)
      ? typeChecker.getTypeAtLocation(nodeForQuickInfo)
      : undefined;
    return (
      type && {
        kind: ts.ScriptElementKind.unknown,
        kindModifiers: ts.ScriptElementKindModifier.none,
        textSpan: (ts as any).createTextSpanFromNode(
          nodeForQuickInfo,
          sourceFile
        ),
        displayParts: typeChecker.runWithCancellationToken(
          cancellationToken,
          typeChecker =>
            (ts as any).typeToDisplayParts(
              typeChecker,
              type,
              (ts as any).getContainerNode(nodeForQuickInfo)
            )
        ),
        documentation: type.symbol
          ? type.symbol.getDocumentationComment(typeChecker)
          : undefined,
        tags: type.symbol ? type.symbol.getJsDocTags() : undefined
      }
    );
  }

  const {
    symbolKind,
    displayParts,
    documentation,
    tags
  } = typeChecker.runWithCancellationToken(cancellationToken, typeChecker =>
    (ts as any).SymbolDisplay.getSymbolDisplayPartsDocumentationAndSymbolKind(
      typeChecker,
      symbol,
      sourceFile,
      (ts as any).getContainerNode(nodeForQuickInfo),
      nodeForQuickInfo
    )
  );
  return {
    kind: symbolKind,
    kindModifiers: (ts as any).SymbolDisplay.getSymbolModifiers(symbol),
    textSpan: (ts as any).createTextSpanFromNode(nodeForQuickInfo, sourceFile),
    displayParts,
    documentation,
    tags
  };
}

export function printQuickInfo(info: ts.QuickInfo): string {
  let out = [];
  const parts = info.displayParts || [];
  const docs = info.documentation || [];
  const tags = info.tags || [];
  for (const part of parts) {
    out.push(part.text);
  }
  if (out.length > 0 && (docs.length > 0 || tags.length > 0)) {
    out.push("\n");
  }
  for (const doc of docs) {
    out.push("\n");
    out.push(doc.text);
  }
  for (const tag of tags) {
    let text = tag.text;
    if (tag.name === "param") {
      text = "@param " + text;
    }
    out.push("\n");
    out.push(text);
  }
  return out.join("");
}
