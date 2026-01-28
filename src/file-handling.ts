import * as fs from "node:fs";
import * as path from "node:path";
import * as acorn from "acorn";

import type { Options } from "./config.ts";
import { EtaFileResolutionError } from "./err.ts";
import type { Eta as EtaCore } from "./internal.ts";

export function readFile(this: EtaCore, path: string): string {
  let res = "";

  try {
    res = fs.readFileSync(path, "utf8");
    // biome-ignore lint/suspicious/noExplicitAny: it's an error
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new EtaFileResolutionError(`Could not find template: ${path}`);
    } else {
      throw err;
    }
  }

  return res;
}

export function resolvePath(
  this: EtaCore,
  templatePath: string,
  options?: Partial<Options>,
): string {
  let resolvedFilePath = "";

  const views = this.config.views;

  if (!views) {
    throw new EtaFileResolutionError("Views directory is not defined");
  }

  const baseFilePath = options?.filepath;
  const defaultExtension =
    this.config.defaultExtension === undefined
      ? ".eta"
      : this.config.defaultExtension;

  // how we index cached template paths
  const cacheIndex = JSON.stringify({
    filename: baseFilePath, // filename of the template which called includeFile()
    path: templatePath,
    views: this.config.views,
  });

  templatePath += path.extname(templatePath) ? "" : defaultExtension;

  // if the file was included from another template
  if (baseFilePath) {
    // check the cache

    if (this.config.cacheFilepaths && this.filepathCache[cacheIndex]) {
      return this.filepathCache[cacheIndex];
    }

    const absolutePathTest = absolutePathRegExp.exec(templatePath);

    if (absolutePathTest?.length) {
      const formattedPath = templatePath.replace(/^\/*|^\\*/, "");
      resolvedFilePath = path.join(views, formattedPath);
    } else {
      resolvedFilePath = path.join(path.dirname(baseFilePath), templatePath);
    }
  } else {
    resolvedFilePath = path.join(views, templatePath);
  }

  if (dirIsChild(views, resolvedFilePath)) {
    // add resolved path to the cache
    if (baseFilePath && this.config.cacheFilepaths) {
      this.filepathCache[cacheIndex] = resolvedFilePath;
    }

    return resolvedFilePath;
  } else {
    throw new EtaFileResolutionError(
      `Template '${templatePath}' is not in the views directory`,
    );
  }
}

function dirIsChild(parent: string, dir: string) {
  const relative = path.relative(parent, dir);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const absolutePathRegExp = /^\\|^\//;

function parseIncludeCall(
  callContent: string,
): { path: string; hasDataParam: boolean } | null {
  try {
    const code = `(${callContent})`;
    const ast = acorn.parse(code, { ecmaVersion: 2020 }) as any;
    const expr = ast.body[0]?.expression;
    if (!expr || expr.type !== "CallExpression") return null;
    const args = expr.arguments;
    if (args.length === 0) return null;
    const pathArg = args[0];
    if (pathArg.type !== "Literal" || typeof pathArg.value !== "string") {
      return null;
    }
    return { path: pathArg.value, hasDataParam: args.length > 1 };
  } catch {
    return null;
  }
}

export function resolveIncludes(
  this: EtaCore,
  templateString: string,
  templatePath: string,
  visited: Set<string> = new Set(),
): string {
  if (visited.has(templatePath)) {
    throw new EtaFileResolutionError(
      `Circular include detected: ${templatePath}`,
    );
  }

  visited.add(templatePath);

  const config = this.config;
  const tags = config.tags;

  const escapeRegex = (str: string) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const openTag = escapeRegex(tags[0]);
  const closeTag = escapeRegex(tags[1]);

  const includeRegex = new RegExp(
    `${openTag}~\\s*((?:E\\.)?(?:include|includeFile)\\s*\\([^]*?\\))\\s*${closeTag}`,
    "g",
  );

  return templateString.replace(includeRegex, (match: string, callContent: string) => {
    try {
      if (!this.resolvePath || !this.readFile) {
        return match;
      }

      const parsed = parseIncludeCall(callContent);
      if (!parsed) {
        return match;
      }

      const { path: includePath, hasDataParam } = parsed;

      if (hasDataParam) {
        return match;
      }

      const resolvedPath = this.resolvePath(includePath, {
        filepath: templatePath,
      });

      const includedContent = this.readFile(resolvedPath);
      const newVisited = new Set(visited);

      return this.resolveIncludes(includedContent, resolvedPath, newVisited);
    } catch (err) {
      if (
        err instanceof EtaFileResolutionError &&
        err.message.includes("Circular")
      ) {
        throw err;
      }
      return match;
    }
  });
}
