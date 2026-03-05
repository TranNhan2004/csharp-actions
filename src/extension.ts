// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { adjustNamespaces } from "./adjust-namespaces";
import { showGui } from "./create-files";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Define all entity types we want to support
  const entities = ["Class", "Interface", "Record", "Struct", "Enum"];

  // 1. Register Creation Commands
  entities.forEach((entity) => {
    const commandId = `cs-actions.create${entity}`;
    const disposable = vscode.commands.registerCommand(
      commandId,
      (uri: vscode.Uri) => {
        // If uri is undefined (e.g., command run from Command Palette),
        // we show an error or fallback to workspace root
        if (!uri) {
          vscode.window.showErrorMessage(
            "Please right-click a folder in the Explorer to use this command.",
          );
          return;
        }
        showGui(entity, uri.fsPath);
      },
    );
    context.subscriptions.push(disposable);
  });

  // 2. Register Adjust Namespaces Command
  const adjustDisposable = vscode.commands.registerCommand(
    "cs-actions.adjustNamespace",
    async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(
          "Please right-click a folder to adjust namespaces.",
        );
        return;
      }

      // Show a progress notification for large folders
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Adjusting C# Namespaces...",
          cancellable: false,
        },
        async () => {
          await adjustNamespaces(uri.fsPath);
        },
      );
    },
  );

  context.subscriptions.push(adjustDisposable);

  console.log("C# Actions extension is now active and ready to use!");
}

// This method is called when your extension is deactivated
export function deactivate() {}
