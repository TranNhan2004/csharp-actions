import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getNamespace } from "./shared/get-namespace";

/**
 * Apply all namespace/using replacements via WorkspaceEdit
 * so the C# language server re-analyzes immediately.
 */
async function replaceInFileViaEdit(
  filePath: string,
  nsMap: Map<string, string>,
  mode: "namespace" | "using",
  edit: vscode.WorkspaceEdit,
): Promise<boolean> {
  const uri = vscode.Uri.file(filePath);
  let content: string;

  // If the file is already open in an editor, read from the in-memory document
  // to avoid overwriting unsaved changes.
  const openDoc = vscode.workspace.textDocuments.find(
    (d) => path.normalize(d.uri.fsPath) === path.normalize(filePath),
  );
  content = openDoc ? openDoc.getText() : fs.readFileSync(filePath, "utf8");

  let changed = false;

  for (const [oldNs, newNs] of nsMap) {
    const escaped = escapeRegex(oldNs);
    const lookahead = mode === "namespace" ? `(?=[\\s;{])` : `(?=[\\s;.])`;
    const pattern = new RegExp(`\\b${mode}\\s+${escaped}${lookahead}`, "g");

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      // Calculate the VS Code Range from string offset
      const startOffset = match.index;
      const endOffset = match.index + match[0].length;

      const document =
        openDoc ?? (await vscode.workspace.openTextDocument(uri));
      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);
      const range = new vscode.Range(startPos, endPos);

      edit.replace(uri, range, `${mode} ${newNs}`);
      changed = true;
    }
  }

  return changed;
}

/**
 * Returns true if the given .csproj content contains a ProjectReference
 * that resolves to targetCsprojPath (normalised absolute path).
 */
function doesProjectReference(
  projContent: string,
  projDir: string,
  targetCsprojNorm: string,
): boolean {
  const refRegex = /<ProjectReference\s+Include="([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = refRegex.exec(projContent)) !== null) {
    const refPath = path.normalize(
      path.resolve(projDir, match[1].replace(/\\/g, path.sep)),
    );
    if (refPath === targetCsprojNorm) {
      return true;
    }
  }
  return false;
}

/** Escapes special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generic helper to find a file type by climbing up the directory tree
 */
function findNearestFile(startPath: string, extension: string): string | null {
  let currentDir = startPath;
  while (currentDir !== path.parse(currentDir).root) {
    const files = fs.readdirSync(currentDir);
    const target = files.find((f) => f.endsWith(extension));
    if (target) {
      return path.join(currentDir, target);
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Main function to adjust namespaces for all .cs files under the given folderPath.
 * It performs 3 steps:
 * 1. Update namespace declarations in the target folder.
 * 2. Update using directives in sibling files of the same project.
 * 3. Update using directives in dependent projects within the same solution.
 */
export async function adjustNamespaces(folderPath: string) {
  const slnFile = findNearestFile(folderPath, ".sln");
  if (!slnFile) {
    vscode.window.showErrorMessage("No Solution (.sln) file found.");
    return;
  }
  const slnRoot = path.dirname(slnFile);

  const sourceCsproj = findNearestFile(folderPath, ".csproj");
  if (!sourceCsproj) {
    vscode.window.showErrorMessage("No .csproj file found for this folder.");
    return;
  }
  const sourceCsprojNorm = path.normalize(sourceCsproj);
  const sourceProjDir = path.dirname(sourceCsprojNorm);

  const targetFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folderPath, "**/*.cs"),
  );
  if (targetFiles.length === 0) {
    vscode.window.showInformationMessage("No .cs files found in this folder.");
    return;
  }

  // Build nsMap
  const nsMap = new Map<string, string>();
  for (const file of targetFiles) {
    const content = fs.readFileSync(file.fsPath, "utf8");
    const nsMatch = content.match(/^namespace\s+([\w.]+)/m);
    if (!nsMatch) {
      continue;
    }
    const oldNs = nsMatch[1];
    if (nsMap.has(oldNs)) {
      continue;
    }
    const newNs = getNamespace(path.dirname(file.fsPath));
    if (oldNs !== newNs) {
      nsMap.set(oldNs, newNs);
    }
  }

  if (nsMap.size === 0) {
    vscode.window.showInformationMessage("All namespaces are already correct.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Refactoring Namespaces...",
      cancellable: false,
    },
    async (progress) => {
      // Single WorkspaceEdit accumulates ALL changes across all files,
      // then applied atomically — Roslyn gets one bulk notification.
      const edit = new vscode.WorkspaceEdit();

      // ── STEP 1 ────────────────────────────────────────────────────────────
      progress.report({
        increment: 0,
        message: "Step 1/3 — Updating namespace declarations...",
      });
      for (const file of targetFiles) {
        await replaceInFileViaEdit(file.fsPath, nsMap, "namespace", edit);
      }

      // ── STEP 2 ────────────────────────────────────────────────────────────
      progress.report({
        increment: 33,
        message: "Step 2/3 — Scanning same-project usings...",
      });
      const targetFilePaths = new Set(
        targetFiles.map((f) => path.normalize(f.fsPath)),
      );
      const siblingFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(sourceProjDir, "**/*.cs"),
      );
      for (const file of siblingFiles) {
        if (targetFilePaths.has(path.normalize(file.fsPath))) {
          continue;
        }
        await replaceInFileViaEdit(file.fsPath, nsMap, "using", edit);
      }

      // ── STEP 3 ────────────────────────────────────────────────────────────
      progress.report({
        increment: 66,
        message: "Step 3/3 — Scanning dependent projects...",
      });
      const allCsprojs = await vscode.workspace.findFiles(
        new vscode.RelativePattern(slnRoot, "**/*.csproj"),
      );
      for (const projUri of allCsprojs) {
        const projPath = path.normalize(projUri.fsPath);
        if (projPath === sourceCsprojNorm) {
          continue;
        }
        const projContent = fs.readFileSync(projPath, "utf8");
        const projDir = path.dirname(projPath);
        if (!doesProjectReference(projContent, projDir, sourceCsprojNorm)) {
          continue;
        }
        const csFiles = await vscode.workspace.findFiles(
          new vscode.RelativePattern(projDir, "**/*.cs"),
        );
        for (const file of csFiles) {
          await replaceInFileViaEdit(file.fsPath, nsMap, "using", edit);
        }
      }

      // ── APPLY ONCE — Roslyn gets a single bulk notification ───────────────
      progress.report({ increment: 90, message: "Applying changes..." });
      await vscode.workspace.applyEdit(edit);
    },
  );

  vscode.window.showInformationMessage(
    `Namespace adjustment complete! (${nsMap.size} namespace(s) updated)`,
  );
}
