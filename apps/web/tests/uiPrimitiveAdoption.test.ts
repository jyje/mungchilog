import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (relative(process.cwd(), path).replaceAll("\\", "/") === "src/components/ui") return [];
      return sourceFiles(path);
    }
    return extname(path) === ".tsx" ? [path] : [];
  });
}

describe("product UI primitive adoption", () => {
  it("does not bypass shadcn with visible native interactive elements", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /<(?:button|input|select|textarea)\b/.test(source)
        ? [relative(process.cwd(), path).replaceAll("\\", "/")]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});
