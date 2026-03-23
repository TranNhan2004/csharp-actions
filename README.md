# C# Actions

A lightweight and powerful VS Code extension for C# developers to streamline entity creation and manage namespaces efficiently.

## Features

### 1. Advanced Entity Creation

Right-click any folder to create C# entities with modern **File-scoped namespaces**.

- **Supported Types:** Class, Interface, Record, Struct, and Enum.
- **Access Modifiers:** Support for `public`, `internal`, and `file`.
- **Smart Naming:** Automatically prefixes Interfaces with `I` if omitted.

### 2. Solution-Wide Namespace Adjustment

Refactor your project structure without the headache of manual string replacement.

- **Sync Namespaces:** Updates all `.cs` files in a folder to match their current directory structure.
- **Global Reference Update:** Automatically scans all projects within the same **Solution (.sln)** and updates `using` statements in dependent projects.

## How to Use

1. **Create Entity:** Right-click a folder in the Explorer -> `C# Actions` -> `Create <Entity>`.
2. **Adjust Namespaces:** Right-click a folder -> `C# Actions` -> `Adjust Namespaces`.

## Requirements

- Works best with **.NET 6.0+** (for file-scoped namespace support).
- Requires a `.csproj` file to calculate namespaces and a `.sln` or `.slnx` file for global refactoring.

## Installation

Since this is a community-driven tool, install it manually via VSIX:

1. Download the `.vsix` file from the GitHub Releases page.
2. In VS Code, go to Extensions (`Ctrl+Shift+X`).
3. Click `...` (Views and More Actions) -> `Install from VSIX...`.
