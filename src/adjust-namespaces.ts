import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getNamespace } from "./shared/get-namespace";

/**
 * Find the nearest file based on folder hierarchy (solution or project files)
 */
function findNearestFile(startPath: string, extensions: string[]): string | null {
  let currentDir = startPath;
  while (currentDir !== path.parse(currentDir).root) {
    try {
      const files = fs.readdirSync(currentDir);
      const target = files.find((fileName) =>
        extensions.some((extension) => fileName.endsWith(extension)),
      );
      if (target) {
        return path.join(currentDir, target);
      }
    } catch {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Process intelligent replacements: match prefixes and avoid overriding edits
 */
async function processFileChanges(
  filePath: string,
  nsMap: [string, string][], // Sorted by descending length
  edit: vscode.WorkspaceEdit,
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  // Open the document through VS Code to obtain accurate text (even if unsaved)
  const document = await vscode.workspace.openTextDocument(uri);
  const text = document.getText();

  // Regex to capture namespace and using directives:
  // Group 1: keyword, Group 2: namespace string
  const pattern = /^\s*(namespace|using)\s+([\w.]+)(?=[;{\s])/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const keyword = match[1];
    const matchedNs = match[2];

    for (const [oldNs, newNs] of nsMap) {
      // Check exact match OR prefix match (e.g., A.B.C matches A.B.C.Models)
      if (matchedNs === oldNs || matchedNs.startsWith(oldNs + ".")) {
        // Calculate the starting position of the namespace string in the line
        const startOffset = match.index + match[0].indexOf(matchedNs);
        // Only replace the old prefix with the new prefix
        const endOffset = startOffset + oldNs.length;

        const range = new vscode.Range(
          document.positionAt(startOffset),
          document.positionAt(endOffset),
        );

        edit.replace(uri, range, newNs);
        break; // Stop at the longest matching mapping
      }
    }
  }
}

export async function adjustNamespaces(folderPath: string) {
  const slnFile = findNearestFile(folderPath, [".sln", ".slnx"]);
  if (!slnFile) {
    vscode.window.showErrorMessage("No Solution (.sln or .slnx) file found.");
    return;
  }
  const slnRoot = path.dirname(slnFile);

  // Get files from the moved folder to build the namespace map
  const targetFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folderPath, "**/*.cs"),
  );

  if (targetFiles.length === 0) {
    return;
  }

  // 1. Collect old and new namespaces
  const nsMapRaw = new Map<string, string>();
  for (const file of targetFiles) {
    const content = fs.readFileSync(file.fsPath, "utf8");
    const nsMatch = content.match(/^namespace\s+([\w.]+)/m);
    if (!nsMatch) {
      continue;
    }

    const oldNs = nsMatch[1];
    const newNs = getNamespace(path.dirname(file.fsPath));
    if (oldNs !== newNs) {
      nsMapRaw.set(oldNs, newNs);
    }
  }

  if (nsMapRaw.size === 0) {
    vscode.window.showInformationMessage("Namespaces are already up to date.");
    return;
  }

  // 2. Sort mappings: longer (more specific) namespaces first for priority matching
  const sortedMappings = Array.from(nsMapRaw.entries()).sort(
    (a, b) => b[0].length - a[0].length,
  );

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "C# Actions: Refactoring Solution Namespaces...",
      cancellable: false,
    },
    async (progress) => {
      const edit = new vscode.WorkspaceEdit();

      // Scan the entire solution to update using directives across all projects
      progress.report({ message: "Scanning all files in solution..." });
      const allFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(slnRoot, "**/*.cs"),
        "**/bin/**,**/obj/**",
      );

      const total = allFiles.length;
      for (let i = 0; i < total; i++) {
        if (i % 20 === 0) {
          progress.report({
            increment: (20 / total) * 100,
            message: `Processing file ${i}/${total}...`,
          });
        }
        await processFileChanges(allFiles[i].fsPath, sortedMappings, edit);
      }

      progress.report({ message: "Finalizing changes..." });
      await vscode.workspace.applyEdit(edit);
    },
  );

  vscode.window.showInformationMessage(
    `Refactor complete! Solution updated based on ${nsMapRaw.size} changes.`,
  );
}
