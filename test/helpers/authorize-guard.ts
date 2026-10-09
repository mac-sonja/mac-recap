import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Static check for AD-11: every exported server action and route handler calls
 * `authorize(` (imported from `@/modules/access`) before any other module call.
 * `getActor` (and the access error responders) may come first. "Module call" means a call to anything imported
 * from `@/modules/*`. Calls inside nested functions never count as the
 * authorize call, because nothing guarantees they run first.
 */

export interface Violation {
  file: string;
  exportName: string;
  reason: string;
}

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
// Access helpers that resolve the actor or answer a failed resolution.
const ALLOWED_BEFORE_AUTHORIZE = new Set(["getActor", "respondToAppError", "httpStatusFor"]);

const isRouteFile = (file: string) => /(^|[\\/])route\.(ts|tsx|js|mjs)$/.test(file);

function hasUseServerDirective(statements: ts.NodeArray<ts.Statement>): boolean {
  for (const s of statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === "use server") return true;
  }
  return false;
}

/** Local names bound to `@/modules/*` imports: named → imported name, namespace → "*". */
function moduleImports(sf: ts.SourceFile): Map<string, { from: string; imported: string }> {
  const names = new Map<string, { from: string; imported: string }>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const from = s.moduleSpecifier.text;
    if (!/^@\/modules(\/|$)/.test(from)) continue;
    const clause = s.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) names.set(clause.name.text, { from, imported: "default" });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) names.set(bindings.name.text, { from, imported: "*" });
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if (el.isTypeOnly) continue;
        names.set(el.name.text, { from, imported: (el.propertyName ?? el.name).text });
      }
    }
  }
  return names;
}

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const isFunctionLike = (n: ts.Node): n is FunctionLike =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** Resolves a call to `{ from, name }` when it targets a `@/modules/*` import. */
function moduleCallee(call: ts.CallExpression, imports: ReturnType<typeof moduleImports>) {
  let callee: ts.Expression = call.expression;
  while (ts.isParenthesizedExpression(callee) || ts.isNonNullExpression(callee)) callee = callee.expression;
  if (ts.isIdentifier(callee)) {
    const imp = imports.get(callee.text);
    if (imp && imp.imported !== "*") return { from: imp.from, name: imp.imported };
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const imp = imports.get(callee.expression.text);
    if (imp) return { from: imp.from, name: callee.name.text };
  }
  if (ts.isElementAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const imp = imports.get(callee.expression.text);
    if (imp) return { from: imp.from, name: "<computed>" };
  }
  return null;
}

/** Checks one exported function body; returns a reason when it fails. */
function checkFunction(fn: FunctionLike, imports: ReturnType<typeof moduleImports>): string | null {
  if (!fn.body) return "has no body";
  const calls: { pos: number; from: string; name: string; nested: boolean }[] = [];
  const visit = (node: ts.Node, nested: boolean) => {
    if (ts.isCallExpression(node)) {
      const target = moduleCallee(node, imports);
      // Ordered by end: a call inside authorize's own arguments completes before it.
      if (target) calls.push({ pos: node.getEnd(), ...target, nested });
    }
    ts.forEachChild(node, (child) => visit(child, nested || isFunctionLike(child)));
  };
  visit(fn.body, false);
  calls.sort((a, b) => a.pos - b.pos);

  const isAuthorize = (c: (typeof calls)[number]) =>
    c.name === "authorize" && c.from === "@/modules/access" && !c.nested;
  const firstAuthorize = calls.findIndex(isAuthorize);
  if (firstAuthorize === -1) return "never calls authorize( from @/modules/access";
  const early = calls
    .slice(0, firstAuthorize)
    .find((c) => !(c.from === "@/modules/access" && ALLOWED_BEFORE_AUTHORIZE.has(c.name)));
  if (early) return `calls ${early.name}( from ${early.from} before authorize(`;
  return null;
}

/** Checks one source file. `file` is used only for classification and messages. */
export function checkSource(file: string, code: string): Violation[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const route = isRouteFile(file);
  const useServerFile = hasUseServerDirective(sf.statements);
  const imports = moduleImports(sf);
  const violations: Violation[] = [];
  const report = (exportName: string, reason: string | null) => {
    if (reason) violations.push({ file, exportName, reason });
  };
  const guarded = (name: string) => useServerFile || (route && HTTP_METHODS.has(name));

  for (const s of sf.statements) {
    const exported = ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

    if (ts.isFunctionDeclaration(s) && exported) {
      if (!s.body) continue; // overload signature; the implementation is checked
      const name = isDefault ? "default" : (s.name?.text ?? "default");
      if (guarded(name)) report(name, checkFunction(s, imports));
    } else if (ts.isVariableStatement(s) && exported) {
      for (const d of s.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : "<destructured>";
        if (!guarded(name)) continue;
        let init = d.initializer;
        while (init && (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isSatisfiesExpression(init)))
          init = init.expression;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) report(name, checkFunction(init, imports));
        else report(name, "is not a function literal, so authorize( cannot be verified");
      }
    } else if (ts.isExportAssignment(s) && useServerFile) {
      report("default", "export default of an expression cannot be verified");
    } else if (ts.isExportDeclaration(s) && (useServerFile || route) && !s.isTypeOnly) {
      if (route && !useServerFile && s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const el of s.exportClause.elements) {
          if (HTTP_METHODS.has(el.name.text)) report(el.name.text, "is re-exported, so authorize( cannot be verified");
        }
      } else {
        report("<re-export>", "re-exports cannot be verified; define the action in this file");
      }
    }
  }

  // Inline server actions: any function whose body starts with "use server".
  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && node.body && ts.isBlock(node.body) && hasUseServerDirective(node.body.statements)) {
      const parent = node.parent;
      const name =
        (node.name && ts.isIdentifier(node.name) && node.name.text) ||
        (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.name.text) ||
        `<inline action at line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}>`;
      report(name, checkFunction(node, imports));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return violations;
}

/** Every source file under `dir`, as absolute paths. */
export function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|js|mjs|jsx)$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

/** Checks every file under `dir`; violation paths are relative to `root`. */
export function checkTree(root: string, dir: string): Violation[] {
  return listSourceFiles(dir).flatMap((abs) => checkSource(relative(root, abs), readFileSync(abs, "utf8")));
}
