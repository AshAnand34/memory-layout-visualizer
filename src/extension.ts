// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "memory-layout-visualizer" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('memory-layout-visualizer.openMemoryVisualizer', () => {
		console.log('Command executed: Open Memory Visualizer'); // Debug log

		// Create and show a new Webview panel
		const panel = vscode.window.createWebviewPanel(
			'memoryLayoutVisualizer', // Identifies the type of the webview. Used internally
			'Memory Layout Visualizer', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel in the side
			{} // Webview options. More on these later.
		);

		console.log('Webview panel created'); // Debug log

		// Set the HTML content for the Webview
		panel.webview.html = getWebviewContent();
		console.log('Webview content set'); // Debug log
	});

	context.subscriptions.push(disposable);

	// Create a status bar item
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '$(graph) Open Memory Visualizer';
	statusBarItem.command = 'memory-layout-visualizer.openMemoryVisualizer';
	statusBarItem.tooltip = 'Open the Memory Layout Visualizer';

	// Update visibility based on active editor
	const updateStatusBarVisibility = (editor: vscode.TextEditor | undefined) => {
		if (editor && ['c', 'cpp', 'rust'].includes(editor.document.languageId)) {
			statusBarItem.show();
		} else {
			statusBarItem.hide();
		}
	};

	// Listen for active editor changes
	updateStatusBarVisibility(vscode.window.activeTextEditor);
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(updateStatusBarVisibility)
	);

	// Add the status bar item to subscriptions
	context.subscriptions.push(statusBarItem);

	// Function to provide HTML content for the Webview
	function getWebviewContent(): string {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'self'; style-src 'self' vscode-resource:;">
			<title>Memory Layout Visualizer</title>
		</head>
		<body>
			<h1>Welcome to the Memory Layout Visualizer</h1>
			<p>This is where the memory layout visualization will appear.</p>
		</body>
		</html>`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
