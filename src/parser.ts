import * as vscode from 'vscode';
import Parser from 'tree-sitter';
import TreeSitterC from 'tree-sitter-c';

let isParserInitialized = false;

export async function initializeParser(extensionPath: string): Promise<Parser> {
    if (!isParserInitialized) {
        console.log('Initializing Tree-sitter parser...');
        isParserInitialized = true;
    }

    const parser = new Parser();
    parser.setLanguage(TreeSitterC as unknown as Parser.Language);

    console.log('Tree-sitter C language set successfully.');
    console.log('Tree-sitter C grammar node types:', TreeSitterC.nodeTypeInfo);
    return parser;
}

export async function parseCurrentFile(parser: Parser): Promise<{ tree: Parser.Tree | null; functions: string[] }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return { tree: null, functions: [] };
    }

    const code = editor.document.getText();
    const tree = parser.parse(code);

    console.log('Generated syntax tree:', tree.rootNode.toString());

    // Extract function names
    const functions: string[] = [];
    if (tree) {
        const cursor = tree.walk();
        do {
            if (cursor.nodeType === 'function_definition') {
                const functionNameNode = cursor.currentNode.childForFieldName('name');
                console.log(`Function name node: ${functionNameNode?.type}, Text: ${functionNameNode?.text}`);
                let functionName = functionNameNode?.text || 'anonymous';

                // Fallback: Traverse children if functionNameNode is null
                if (!functionNameNode) {
                    for (const child of cursor.currentNode.namedChildren) {
                        if (child.type === 'identifier') { // Assuming 'identifier' is the type for function names
                            console.log(`Fallback function name found: ${child.text}`);
                            functionName = child.text;
                            break;
                        }
                    }
                }

                functions.push(functionName);
            }
        } while (cursor.gotoNextSibling());
    } else {
        vscode.window.showErrorMessage('Failed to parse the code.');
    }

    return { tree, functions };
}

function logSyntaxTree(node: Parser.SyntaxNode, depth: number = 0): void {
    const indent = '  '.repeat(depth);
    console.log(`${indent}Node type: ${node.type}, Start: ${node.startPosition.row}:${node.startPosition.column}, End: ${node.endPosition.row}:${node.endPosition.column}`);

    for (const child of node.children) {
        logSyntaxTree(child, depth + 1);
    }
}

export async function parseAndSimulateMemory(parser: Parser): Promise<void> {
    const { tree, functions } = await parseCurrentFile(parser);

    if (!tree) {
        vscode.window.showErrorMessage('Failed to parse the code for memory simulation.');
        return;
    }

    console.log('Full syntax tree:');
    logSyntaxTree(tree.rootNode);

    // Simulated memory model
    const stack: { functionName: string; variables: string[] }[] = [];
    const heap: string[] = [];

    function traverseNode(node: Parser.SyntaxNode): void {
        console.log(`Visiting node: ${node.type}, Text: ${node.text}`);

        if (node.type === 'function_definition') {
            console.log('Inspecting function_definition node structure:');
            logSyntaxTree(node);

            let functionName = 'anonymous';

            // Check for function_declarator child
            const functionDeclarator = node.namedChildren.find(child => child.type === 'function_declarator');
            if (functionDeclarator) {
                // Look for identifier within function_declarator
                const identifierNode = functionDeclarator.namedChildren.find(child => child.type === 'identifier');
                if (identifierNode) {
                    functionName = identifierNode.text;
                    console.log(`Extracted function name from function_declarator: ${functionName}`);
                }
            }

            const variables: string[] = [];

            // Check for compound_statement child
            const compoundStatement = node.namedChildren.find(child => child.type === 'compound_statement');
            if (compoundStatement) {
                console.log(`Inspecting compound_statement for function ${functionName}:`);
                logSyntaxTree(compoundStatement);

                // Traverse compound_statement to extract variables and heap allocations
                function traverseCompound(node: Parser.SyntaxNode): void {
                    if (node.type === 'init_declarator') {
                        const variableNameNode = node.childForFieldName('declarator');
                        if (variableNameNode) {
                            const variableName = variableNameNode.text.trim().replace(/^\*+/, ''); // Remove leading '*' for pointer variables
                            if (variableName && !variables.includes(variableName)) {
                                variables.push(variableName);
                                console.log(`Extracted variable name: ${variableName}`);
                            }
                        }
                    }

                    if (node.type === 'call_expression') {
                        const functionName = node.childForFieldName('function')?.text;
                        if ((functionName === 'malloc' || functionName === 'new' || functionName === 'calloc' || functionName === 'realloc') && !heap.includes(node.text)) {
                            heap.push(node.text);
                            console.log(`Heap allocation detected: ${node.text}`);
                        }
                    }

                    // Recursively traverse child nodes
                    for (const child of node.namedChildren) {
                        traverseCompound(child);
                    }
                }

                traverseCompound(compoundStatement);
            }

            stack.push({ functionName, variables });
        }

        // Simulate heap allocations (e.g., malloc, new, calloc, realloc)
        if (node.type === 'call_expression') {
            const functionName = node.childForFieldName('function')?.text;
            if (functionName === 'malloc' || functionName === 'new' || functionName === 'calloc' || functionName === 'realloc') {
                console.log(`Heap allocation detected: ${node.text}`);
                if (!heap.includes(node.text)) {
                    heap.push(node.text);
                }
            }
        }

        // Recursively traverse child nodes
        for (const child of node.namedChildren) {
            traverseNode(child);
        }
    }

    traverseNode(tree.rootNode);

    // Display simulated memory model
    vscode.window.showInformationMessage(
        `Stack: ${JSON.stringify(stack, null, 2)}\nHeap: ${JSON.stringify(heap, null, 2)}`
    );
}
