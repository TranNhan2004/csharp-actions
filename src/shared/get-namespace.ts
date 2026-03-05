import * as fs from "fs";
import * as path from "path";

export function getNamespace(targetPath: string): string {
  let currentDir = targetPath;
  while (currentDir !== path.parse(currentDir).root) {
    const files = fs.readdirSync(currentDir);
    const csproj = files.find((f) => f.endsWith(".csproj"));

    if (csproj) {
      const rootName = path.basename(csproj, ".csproj");
      const relativePath = path.relative(currentDir, targetPath);
      return relativePath
        ? `${rootName}.${relativePath.split(path.sep).join(".")}`
        : rootName;
    }
    currentDir = path.dirname(currentDir);
  }
  return "GlobalNamespace";
}
