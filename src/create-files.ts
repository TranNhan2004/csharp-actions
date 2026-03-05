import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getNamespace } from "./shared/get-namespace";

const typeExampleMap: { [key: string]: string } = {
  Class: "MyClass",
  Interface: "IAction",
  Record: "MyRecord",
  Struct: "MyStruct",
  Enum: "MyEnum",
};

export function showGui(type: string, folderPath: string) {
  const panel = vscode.window.createWebviewPanel(
    "csForm",
    `New ${type}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                padding: 20px; 
                font-family: var(--vscode-font-family); 
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .form-group { margin-bottom: 15px; }
            label { 
                display: block; 
                margin-bottom: 5px; 
                font-size: 12px; 
                font-weight: bold; 
                color: var(--vscode-input-foreground); 
            }
            input, select { 
                width: 100%; 
                padding: 8px; 
                box-sizing: border-box;
                background-color: var(--vscode-input-background); 
                color: var(--vscode-input-foreground); 
                border: 1px solid var(--vscode-input-border);
                outline: none;
            }
            input:focus, select:focus { border: 1px solid var(--vscode-focusBorder); }
            .button-container { margin-top: 25px; display: flex; gap: 10px; }
            button { 
                flex: 1;
                padding: 10px; 
                cursor: pointer; 
                border: none;
                font-weight: bold;
            }
            #create-btn {
                background-color: var(--vscode-button-background); 
                color: var(--vscode-button-foreground); 
            }
            #create-btn:hover { background-color: var(--vscode-button-hoverBackground); }
            #cancel-btn {
                background-color: var(--vscode-button-secondaryBackground); 
                color: var(--vscode-button-secondaryForeground); 
            }
            #cancel-btn:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        </style>
    </head>
    <body>
        <h3>Create New C# ${type}</h3>
        
        <div class="form-group">
            <label for="name">Entity Name</label>
            <input type="text" id="name" placeholder="e.g. ${typeExampleMap[type]}" autofocus>
        </div>

        <div class="form-group">
            <label for="modifier">Access Modifier</label>
            <select id="modifier">
                <option value="public" selected>public</option>
                <option value="internal">internal</option>
                <option value="file">file (C# 11+)</option>
            </select>
        </div>

        <div class="button-container">
            <button id="create-btn" onclick="send()">Create</button>
            <button id="cancel-btn" onclick="cancel()">Cancel</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Allow Enter key to trigger creation
            document.getElementById('name').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') send();
            });

            function send() {
                const name = document.getElementById('name').value.trim();
                const modifier = document.getElementById('modifier').value;
                if (!name) return;
                vscode.postMessage({ command: 'create', n: name, m: modifier });
            }

            function cancel() {
                vscode.postMessage({ command: 'cancel' });
            }
        </script>
    </body>
    </html>`;

  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === "cancel") {
      panel.dispose();
      return;
    }

    if (message.command === "create") {
      const name = message.n;
      const modifier = message.m;
      const namespace = getNamespace(folderPath);

      // Auto-fix Interface naming if needed
      let finalName = name;
      if (type === "Interface" && !name.startsWith("I")) {
        finalName = "I" + name;
      }

      const filePath = path.join(folderPath, `${finalName}.cs`);

      // English Error Handling
      if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(
          `Action Failed: File "${finalName}.cs" already exists in this directory.`,
        );
        return;
      }

      let content = `namespace ${namespace};\n\n`;

      if (type === "Record") {
        content += `${modifier} record ${finalName}();`;
      } else {
        content += `${modifier} ${type.toLowerCase()} ${finalName}\n{\n    \n}`;
      }

      try {
        fs.writeFileSync(filePath, content, "utf8");

        // Open the new file automatically
        vscode.workspace.openTextDocument(filePath).then((doc) => {
          vscode.window.showTextDocument(doc);
        });

        vscode.window.showInformationMessage(
          `Successfully created ${type}: ${finalName}.cs`,
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `System Error: Could not create file. ${err.message}`,
        );
      }

      panel.dispose();
    }
  });
}
