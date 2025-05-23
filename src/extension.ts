// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { estimateTypeSizes, initializeParser, parseAndSimulateMemory } from './parser';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "memory-layout-visualizer" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('memory-layout-visualizer.openMemoryVisualizer', async () => {
		console.log('Command executed: Open Memory Visualizer'); // Debug log

		// Create and show a new Webview panel
		const panel = vscode.window.createWebviewPanel(
			'memoryLayoutVisualizer', // Identifies the type of the webview. Used internally
			'Memory Layout Visualizer', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel in the side
			{
				enableScripts: true, // Allow scripts to run in the Webview
			}
		);

		console.log('Webview panel created'); // Debug log

		// Set the HTML content for the Webview
		const fs = require('fs');
		const webviewPath = path.join(context.extensionPath, 'webview', 'index.html');
		const webviewContent = fs.readFileSync(webviewPath, 'utf8');

		// Resolve the path to styles.css using vscode.Uri
		const stylesPath = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'styles.css'));
		// Replace the placeholder in the HTML content with the resolved path
		const updatedWebviewContent = webviewContent.replace('<link rel="stylesheet" href="styles.css">', `<link rel="stylesheet" href="${stylesPath}">`);

		panel.webview.html = updatedWebviewContent;

		console.log('Webview content set'); // Debug log

		// Initialize the parser and simulate memory
		const parser = await initializeParser(context.extensionPath);
		let memoryModel = await parseAndSimulateMemory(parser);
		let typeSizes = await estimateTypeSizes(parser);

		// Combine memoryModel and typeSizes into a single object
		const combinedModel = {
			...memoryModel,
			typeSizes: typeSizes
		};

		// Add debug logs to verify combined data, including `reference`
		console.log('Combined memory model with references:', JSON.stringify(combinedModel, null, 2));

		// Ensure Webview is fully loaded before sending the combined message
		panel.webview.onDidReceiveMessage((message) => {
			console.log('Message received in extension:', message);
			if (message.command === 'ready') {
				console.log('Webview is ready to receive messages.');
				console.log('Combined data to send (detailed):', JSON.stringify(combinedModel, null, 2));
				panel.webview.postMessage({ type: 'memoryModel', data: combinedModel });
				console.log('Combined data sent to Webview (detailed).');
			}
		});

		// Handle messages from the Webview
		panel.webview.onDidReceiveMessage((message) => {
			switch (message.command) {
				case 'alert':
					vscode.window.showInformationMessage(message.text);
					break;
			}
		});

		// Listen for active editor changes and update the Webview
		vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (editor && ['c', 'cpp', 'rust'].includes(editor.document.languageId)) {
				const parser = await initializeParser(context.extensionPath);
				memoryModel = await parseAndSimulateMemory(parser);

				// Combine memoryModel and typeSizes into a single object
				const combinedModel = {
					...memoryModel,
					typeSizes: typeSizes,
					globals: memoryModel.globals // Ensure globals are included
				};

				// Add debug logs to verify data flow
				console.log('Memory model data to send on editor change:', combinedModel);

				if (panel.webview) {
					panel.webview.postMessage({ type: 'memoryModel', data: combinedModel });
					console.log('Memory model data sent to Webview on editor change.');
				}
			}
		});

		// Listen for document changes and update the Webview
		vscode.workspace.onDidChangeTextDocument(async (event) => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document && ['c', 'cpp', 'rust'].includes(editor.document.languageId)) {
				const parser = await initializeParser(context.extensionPath);
				memoryModel = await parseAndSimulateMemory(parser);

				// Combine memoryModel and typeSizes into a single object
				const combinedModel = {
					...memoryModel,
					typeSizes: typeSizes,
					globals: memoryModel.globals // Ensure globals are included
				};

				// Add debug logs to verify data flow
				console.log('Memory model data to send on document change:', combinedModel);

				if (panel.webview) {
					panel.webview.postMessage({ type: 'memoryModel', data: combinedModel });
					console.log('Memory model data sent to Webview on document change.');
				}
			}
		});
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
