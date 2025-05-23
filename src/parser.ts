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
                
                if (functionName !== 'anonymous') {
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

export async function parseAndSimulateMemory(parser: Parser): Promise<{ stack: { functionName: string; variables: { name: string; type: string; value: string; reference?: string; }[] }[]; heap: { name: string; type: string; allocation: string; value: string; }[]; globals: { name: string; type: string; value: string; }[] }> {
    const { tree, functions } = await parseCurrentFile(parser);

    if (!tree || !tree.rootNode) {
        vscode.window.showErrorMessage('Failed to parse the code for memory simulation.');
        return { stack: [], heap: [], globals: [] };
    }

    console.log('Full syntax tree:');
    logSyntaxTree(tree.rootNode);

    // Simulated memory model
    const stack: { functionName: string; variables: { name: string; type: string; value: string; reference?: string; }[] }[] = [];
    const heap: { name: string; type: string; allocation: string; value: string; }[] = [];
    const globals: { name: string; type: string; value: string; }[] = [];

    function traverseNode(node: Parser.SyntaxNode): void {
        console.log(`Visiting node: ${node.type}, Text: ${node.text}`);

        if (node.type === 'function_definition') {
            let functionName = 'anonymous';

            const functionDeclarator = node.namedChildren.find(child => child.type === 'function_declarator');
            if (functionDeclarator) {
                const identifierNode = functionDeclarator.namedChildren.find(child => child.type === 'identifier');
                if (identifierNode) {
                    functionName = identifierNode.text;
                }
            }

            const variables: { name: string; type: string; value: string; reference?: string; }[] = [];

            const compoundStatement = node.namedChildren.find(child => child.type === 'compound_statement');
            if (compoundStatement) {
                function traverseCompound(node: Parser.SyntaxNode): void {
                    if (node.type === 'init_declarator') {
                        const variableNameNode = node.childForFieldName('declarator');
                        const variableTypeNode = node.childForFieldName('type');
                        const initializerNode = node.childForFieldName('value');

                        if (variableNameNode && variableTypeNode) {
                            let variableName = variableNameNode.text.trim();
                            let variableType = variableTypeNode.text.trim();
                            let variableValue = initializerNode ? initializerNode.text.trim() : 'undefined';

                            if (variableName.startsWith('*')) {
                                const pointerCount = variableName.match(/^\*+/)?.[0].length || 0;
                                variableName = variableName.replace(/^\*+/, '').trim();
                                variableType += '*'.repeat(pointerCount);
                            }

                            if (initializerNode && initializerNode.type === 'call_expression') {
                                variableValue = `Function call: ${initializerNode.text}`;
                            }

                            variables.push({ name: variableName, type: variableType, value: variableValue });
                        }
                    } else if (node.type === 'declaration') {
                        const declaratorNodes = node.namedChildren.filter(child => child.type === 'init_declarator');
                        declaratorNodes.forEach(declaratorNode => {
                            const variableNameNode = declaratorNode.childForFieldName('declarator');
                            const variableTypeNode = node.childForFieldName('type');
                            const initializerNode = declaratorNode.childForFieldName('value');

                            if (variableNameNode && variableTypeNode) {
                                let variableName = variableNameNode.text.trim();
                                let variableType = variableTypeNode.text.trim();
                                let variableValue = initializerNode ? initializerNode.text.trim() : 'undefined';

                                if (variableName.startsWith('*')) {
                                    const pointerCount = variableName.match(/^\*+/)?.[0].length || 0;
                                    variableName = variableName.replace(/^\*+/, '').trim();
                                    variableType += '*'.repeat(pointerCount);
                                }

                                if (initializerNode && initializerNode.type === 'call_expression') {
                                    variableValue = `Function call: ${initializerNode.text}`;
                                }

                                variables.push({ name: variableName, type: variableType, value: variableValue });
                            }
                        });
                    }

                    node.namedChildren.forEach(traverseCompound);
                }

                traverseCompound(compoundStatement);
            }

            stack.push({ functionName, variables });
        } else if (node.type === 'call_expression') {
            const functionNameNode = node.childForFieldName('function');
            if (functionNameNode && (functionNameNode.text === 'malloc' || functionNameNode.text === 'calloc' || functionNameNode.text === 'realloc')) {
                const argumentNode = node.childForFieldName('arguments');
                console.log('Argument node:', argumentNode?.type);
                if (argumentNode) {
                    const allocationSize = argumentNode.text;
                    const allocationName = `heap_${heap.length}`;
                    // Default type
                    let allocationType = 'void*'; 
                    if (argumentNode.namedChildren) {
                        const sizeofNode = argumentNode.namedChildren.find(child => child.type === 'sizeof_expression');
                        if (sizeofNode) {
                            const typeNode = sizeofNode.childForFieldName('type');
                            if (typeNode) {
                                allocationType = typeNode.text.trim();
                            }
                        }
                    }

                    // Add heap allocation with determined type
                    heap.push({
                        name: allocationName,
                        type: allocationType,
                        allocation: allocationSize,
                        value: 'uninitialized' // Default value for now
                    });

                    // Check for assignments to dereferenced variables
                    const parentNode = node.parent;
                    console.log('Parent node:', parentNode?.type);

                    if (parentNode && parentNode.type === 'assignment_expression') {
                        const stackVariableNode = parentNode.childForFieldName('left');
                        const rightNode = parentNode.childForFieldName('right');

                        console.log('Stack variable node:', stackVariableNode?.type);
                        console.log('Right node:', rightNode?.type);

                        if (stackVariableNode && stackVariableNode.type === 'pointer_expression') {
                            const dereferencedVariableName = stackVariableNode.childForFieldName('argument')?.text.trim();
                            const assignedValue = rightNode ? rightNode.text.trim() : 'undefined';

                            console.log('Dereferenced variable name:', dereferencedVariableName);
                            console.log('Assigned value:', assignedValue);

                            // Update heap allocation value
                            const heapAllocation = heap.find(allocation => allocation.name === allocationName);
                            if (heapAllocation) {
                                console.log('Updating heap allocation:', heapAllocation);
                                heapAllocation.value = assignedValue;
                            } else {
                                console.warn('Heap allocation not found for:', allocationName);
                            }

                            // Update stack variable reference
                            stack.forEach(frame => {
                                const stackVariable = frame.variables.find(variable => variable.name === dereferencedVariableName);
                                if (stackVariable) {
                                    stackVariable.reference = allocationName;
                                }
                            });
                        }
                    } else if (parentNode && parentNode.type === 'cast_expression') {
                        // Traverse up the syntax tree to find the assignment or pointer expression
                        let currentNode = node.parent;
                        while (currentNode && currentNode.type === 'cast_expression') {
                            currentNode = currentNode.parent;
                        }

                        console.log('Current node after cast:', currentNode?.type);

                        if (currentNode && currentNode.type === 'assignment_expression') {
                            const stackVariableNode = currentNode.childForFieldName('left');
                            const rightNode = currentNode.childForFieldName('right');

                            console.log('Stack variable node after cast:', stackVariableNode?.type);
                            console.log('Right node after cast:', rightNode?.type);

                            if (stackVariableNode && stackVariableNode.type === 'pointer_expression') {
                                const dereferencedVariableName = stackVariableNode.childForFieldName('argument')?.text.trim();
                                const assignedValue = rightNode ? rightNode.text.trim() : 'undefined';

                                console.log('Dereferenced variable name after cast:', dereferencedVariableName);
                                console.log('Assigned value after cast:', assignedValue);

                                // Update heap allocation value
                                const heapAllocation = heap.find(allocation => allocation.name === allocationName);
                                if (heapAllocation) {
                                    console.log('Updating heap allocation after cast:', heapAllocation);
                                    heapAllocation.value = assignedValue;
                                } else {
                                    console.warn('Heap allocation not found for:', allocationName);
                                }

                                // Update stack variable reference
                                stack.forEach(frame => {
                                    const stackVariable = frame.variables.find(variable => variable.name === dereferencedVariableName);
                                    if (stackVariable) {
                                        stackVariable.reference = allocationName;
                                    }
                                });
                            }
                        } else if (currentNode && currentNode.type === 'init_declarator') {
                            const initializerNode = currentNode.childForFieldName('value');
                            if (initializerNode) {
                                const assignedValue = initializerNode.text.trim();

                                console.log('Assigned value from init_declarator:', assignedValue);

                                // Update heap allocation value
                                const heapAllocation = heap.find(allocation => allocation.name === allocationName);
                                if (heapAllocation) {
                                    console.log('Updating heap allocation from init_declarator:', heapAllocation);
                                    heapAllocation.value = assignedValue;
                                } else {
                                    console.warn('Heap allocation not found for:', allocationName);
                                }
                            }
                        }
                    }
                }
            }
        } else if (node.type === 'declaration') {
            // Check for global/static variables
            const isGlobal = !node.parent || node.parent.type === 'translation_unit';
            const isStatic = node.namedChildren.some(child => child.type === 'storage_class_specifier' && child.text === 'static');

            if (isGlobal || isStatic) {
                const variableNameNode = node.childForFieldName('declarator');
                const variableTypeNode = node.childForFieldName('type');
                const initializerNode = node.childForFieldName('value');

                if (variableNameNode && variableTypeNode) {
                    const variableName = variableNameNode.text.trim();
                    const variableType = variableTypeNode.text.trim();
                    const variableValue = initializerNode ? initializerNode.text.trim() : 'undefined';

                    globals.push({ name: variableName, type: variableType, value: variableValue });
                    console.log(`Global/static variable detected: ${variableName} (${variableType}) = ${variableValue}`);
                }
            }
        }

        node.namedChildren.forEach(traverseNode);
    }

    traverseNode(tree.rootNode);

    return { stack, heap, globals };
}

export async function estimateTypeSizes(parser: Parser): Promise<{ [type: string]: number }> {
    // Define a basic mapping of types to their sizes (in bytes)
    const typeSizes: { [type: string]: number } = {
        'int': 4,
        'float': 4,
        'double': 8,
        'char': 1,
        'short': 2,
        'long': 8,
        '*': 8, // Pointer size (assuming 64-bit architecture)
    };

    function getTypeSize(type: string): number {
        if (type.includes('*')) { // Check if the type contains a '*', indicating a pointer
            return typeSizes['*']; // Return pointer size for all pointer types
        }
        return typeSizes[type] || 0; // Return size for known types or 0 for unknown types
    }

    // Add logic to parse the current file and identify custom types
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return typeSizes;
    }

    const code = editor.document.getText();
    const tree = parser.parse(code);

    if (!tree) {
        vscode.window.showErrorMessage('Failed to parse the code for type size estimation.');
        return typeSizes;
    }

    // Traverse the syntax tree to identify custom types (e.g., structs)
    function traverseNode(node: Parser.SyntaxNode): void {
        if (node.type === 'struct_specifier') {
            const structNameNode = node.childForFieldName('name');
            if (structNameNode) {
                const structName = structNameNode.text;
                // Estimate size of the struct (sum of its fields)
                let structSize = 0;
                const fieldNodes = node.namedChildren.filter(child => child.type === 'field_declaration');
                fieldNodes.forEach(field => {
                    const fieldTypeNode = field.childForFieldName('type');
                    if (fieldTypeNode) {
                        const fieldType = fieldTypeNode.text;
                        structSize += getTypeSize(fieldType);
                    }
                });
                typeSizes[structName] = structSize;
            }
        }

        // Recursively traverse child nodes
        node.namedChildren.forEach(traverseNode);
    }

    traverseNode(tree.rootNode);

    return typeSizes;
}
