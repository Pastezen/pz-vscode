import * as vscode from 'vscode';
import { PastezenAPI, CreatePasteOptions } from './api';
import { PastesProvider, FileItem } from './pastesProvider';
import { trackDocument, getDocumentMetadata, isTrackedDocument } from './documentTracker';
import { encryptContent, decryptContent } from './crypto';

export function activate(context: vscode.ExtensionContext) {
    console.log('Pastezen extension activating...');

    let api: PastezenAPI;
    let pastesProvider: PastesProvider;

    try {
        api = new PastezenAPI();
        pastesProvider = new PastesProvider(api);

        // Register tree view
        vscode.window.registerTreeDataProvider('pastezenPastes', pastesProvider);
    } catch (error: any) {
        console.error('Pastezen: Failed to initialize API:', error);
        vscode.window.showErrorMessage(`Pastezen initialization failed: ${error.message}`);
    }

    // Set API token - ALWAYS register this command
    const setApiToken = vscode.commands.registerCommand(
        'pastezen.setApiToken',
        async () => {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your Pastezen API token',
                password: true,
                placeHolder: 'Get your token from https://pastezen.com/tokens'
            });

            if (token) {
                await vscode.workspace.getConfiguration('pastezen').update(
                    'apiToken',
                    token,
                    vscode.ConfigurationTarget.Global
                );
                vscode.window.showInformationMessage('API token saved! Please reload VS Code.');
            }
        }
    );
    context.subscriptions.push(setApiToken);

    // Only register other commands if API initialized successfully
    if (api! && pastesProvider!) {
        // Create paste from selection
        const createFromSelection = vscode.commands.registerCommand(
            'pastezen.createPasteFromSelection',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const selection = editor.selection;
                const text = editor.document.getText(selection);

                if (!text) {
                    vscode.window.showErrorMessage('No text selected');
                    return;
                }

                const fileName = editor.document.fileName.split('/').pop() || 'selection.txt';
                const language = editor.document.languageId;

                await createPaste(api, fileName, text, language, pastesProvider);
            }
        );

        // Create paste from file
        const createFromFile = vscode.commands.registerCommand(
            'pastezen.createPasteFromFile',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const text = editor.document.getText();
                const fileName = editor.document.fileName.split('/').pop() || 'file.txt';
                const language = editor.document.languageId;

                await createPaste(api, fileName, text, language, pastesProvider);
            }
        );

        // Refresh pastes
        const refreshPastes = vscode.commands.registerCommand(
            'pastezen.refreshPastes',
            () => pastesProvider.refresh()
        );

        // Open paste
        const openPaste = vscode.commands.registerCommand(
            'pastezen.openPaste',
            async (paste: any) => {
                const webUrl = vscode.workspace.getConfiguration('pastezen').get<string>('webUrl');
                const url = `${webUrl}/pastes/${paste.id}`;
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        );

        // Delete paste
        const deletePaste = vscode.commands.registerCommand(
            'pastezen.deletePaste',
            async (paste: any) => {
                const confirm = await vscode.window.showWarningMessage(
                    `Delete paste "${paste.title}"?`,
                    'Delete',
                    'Cancel'
                );

                if (confirm === 'Delete') {
                    try {
                        await api.deletePaste(paste.id);
                        vscode.window.showInformationMessage(`Deleted: ${paste.title}`);
                        pastesProvider.refresh();
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Failed to delete paste: ${error.message}`);
                    }
                }
            }
        );

        // Copy paste URL
        const copyPasteUrl = vscode.commands.registerCommand(
            'pastezen.copyPasteUrl',
            async (paste: any) => {
                const webUrl = vscode.workspace.getConfiguration('pastezen').get<string>('webUrl');
                const url = `${webUrl}/pastes/${paste.id}`;
                await vscode.env.clipboard.writeText(url);
                vscode.window.showInformationMessage('Paste URL copied to clipboard');
            }
        );

        // Open paste content in editor (for single-file pastes)
        const openPasteInEditor = vscode.commands.registerCommand(
            'pastezen.openPasteInEditor',
            async (paste: any) => {
                try {
                    console.log('Opening paste:', paste.id, 'isPasswordProtected:', paste.isPasswordProtected);
                    let fullPaste: any;
                    let passphrase: string | undefined;

                    // Check if paste is private/password-protected
                    if (paste.isPasswordProtected) {
                        passphrase = await vscode.window.showInputBox({
                            prompt: `🔐 Enter passphrase to unlock "${paste.title}"`,
                            password: true,
                            ignoreFocusOut: true
                        });

                        if (!passphrase) {
                            return;
                        }

                        try {
                            console.log('Unlocking paste with password...');
                            fullPaste = await api.unlockPaste(paste.id, passphrase);
                            console.log('Paste unlocked successfully');
                        } catch (unlockError: any) {
                            console.error('Unlock failed:', unlockError.response?.status, unlockError.message);
                            vscode.window.showErrorMessage('Incorrect passphrase');
                            return;
                        }
                    } else {
                        console.log('Fetching public paste...');
                        fullPaste = await api.getPaste(paste.id);
                    }

                    if (fullPaste.files && fullPaste.files.length > 0) {
                        const file = fullPaste.files[0];
                        let content = file.content;

                        // Decrypt if encrypted
                        if (passphrase && file.salt && file.iv) {
                            try {
                                console.log('Decrypting content...');
                                content = decryptContent(file.content, passphrase, file.salt, file.iv);
                            } catch (decryptError) {
                                vscode.window.showErrorMessage('Failed to decrypt content');
                                return;
                            }
                        }

                        await openContentInEditor(content, file.language, file.name, paste.id, 0);
                    }
                } catch (error: any) {
                    console.error('Open paste error:', error);
                    const is403 = error.response?.status === 403 ||
                        error.message?.includes('403');

                    if (is403) {
                        // Try prompting for password if we get 403
                        const passphrase = await vscode.window.showInputBox({
                            prompt: `🔐 This paste is protected. Enter passphrase:`,
                            password: true,
                            ignoreFocusOut: true
                        });

                        if (passphrase) {
                            try {
                                const fullPaste = await api.unlockPaste(paste.id, passphrase);
                                if (fullPaste.files && fullPaste.files.length > 0) {
                                    const file = fullPaste.files[0];
                                    let content = file.content;
                                    if (file.salt && file.iv) {
                                        content = decryptContent(file.content, passphrase, file.salt, file.iv);
                                    }
                                    await openContentInEditor(content, file.language, file.name, paste.id, 0);
                                }
                            } catch (unlockError: any) {
                                vscode.window.showErrorMessage('Incorrect passphrase');
                            }
                        }
                        return;
                    }
                    vscode.window.showErrorMessage(`Failed to open paste: ${error.message}`);
                }
            }
        );

        // Open file content in editor (for multi-file pastes)
        const openFileInEditor = vscode.commands.registerCommand(
            'pastezen.openFileInEditor',
            async (fileItem: FileItem) => {
                try {
                    await openContentInEditor(fileItem.content, fileItem.language, fileItem.fileName, fileItem.pasteId, fileItem.fileIndex);
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
                }
            }
        );

        // Save current document back to Pastezen
        const saveToPastezen = vscode.commands.registerCommand(
            'pastezen.saveToPastezen',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showErrorMessage('No active editor');
                    return;
                }

                const metadata = getDocumentMetadata(editor.document.uri);
                if (!metadata) {
                    // Not a tracked paste document - offer to create new paste
                    const action = await vscode.window.showInformationMessage(
                        'This document is not linked to a Pastezen paste.',
                        'Create New Paste',
                        'Cancel'
                    );
                    if (action === 'Create New Paste') {
                        vscode.commands.executeCommand('pastezen.createPasteFromFile');
                    }
                    return;
                }

                try {
                    const content = editor.document.getText();
                    const paste = await api.getPaste(metadata.pasteId);

                    // Update the specific file in the paste (store as plain text)
                    paste.files[metadata.fileIndex].content = content;

                    await api.updatePaste(metadata.pasteId, {
                        files: paste.files
                    });

                    vscode.window.showInformationMessage(`✅ Saved to Pastezen: ${metadata.fileName}`);
                    pastesProvider.refresh();
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to save: ${error.message}`);
                }
            }
        );

        context.subscriptions.push(
            createFromSelection,
            createFromFile,
            refreshPastes,
            openPaste,
            deletePaste,
            copyPasteUrl,
            openPasteInEditor,
            openFileInEditor,
            saveToPastezen
        );

        // Auto-refresh pastes on activation
        pastesProvider.refresh();
    }

    console.log('Pastezen extension activated successfully');
}

async function createPaste(
    api: PastezenAPI,
    fileName: string,
    content: string,
    language: string,
    pastesProvider: PastesProvider
) {
    try {
        // Step 1: Get title
        const title = await vscode.window.showInputBox({
            prompt: 'Enter paste title',
            value: fileName
        });

        if (!title) {
            return;
        }

        // Step 2: Choose visibility
        const visibility = await vscode.window.showQuickPick(
            [
                { label: '🌍 Public', description: 'Anyone can view', value: 'public' as const },
                { label: '🔒 Private', description: 'Password protected & encrypted', value: 'private' as const }
            ],
            { placeHolder: 'Choose visibility' }
        );

        if (!visibility) {
            return;
        }

        let pasteOptions: CreatePasteOptions = {
            title,
            fileName,
            content: Buffer.from(content).toString('base64'),
            language,
            visibility: visibility.value
        };

        // Step 3: If private, get encryption options
        if (visibility.value === 'private') {
            const algorithm = await vscode.window.showQuickPick(
                [
                    { label: 'AES-256', description: 'Recommended - strongest encryption', value: 'aes' as const },
                    { label: '3DES', description: 'Legacy triple DES', value: 'des' as const },
                    { label: 'RC4', description: 'Stream cipher', value: 'rc4' as const }
                ],
                { placeHolder: 'Choose encryption algorithm' }
            );

            if (!algorithm) {
                return;
            }

            const passphrase = await vscode.window.showInputBox({
                prompt: 'Enter encryption passphrase (min 6 characters)',
                password: true,
                validateInput: (value) => {
                    if (value.length < 6) {
                        return 'Passphrase must be at least 6 characters';
                    }
                    return null;
                }
            });

            if (!passphrase) {
                return;
            }

            const confirmPassphrase = await vscode.window.showInputBox({
                prompt: 'Confirm passphrase',
                password: true,
                validateInput: (value) => {
                    if (value !== passphrase) {
                        return 'Passphrases do not match';
                    }
                    return null;
                }
            });

            if (!confirmPassphrase) {
                return;
            }

            // Encrypt content
            const encrypted = encryptContent(content, passphrase);

            pasteOptions = {
                ...pasteOptions,
                content: encrypted.encrypted,
                encryptionLevel: algorithm.value,
                isPasswordProtected: true,
                password: passphrase,
                salt: encrypted.salt,
                iv: encrypted.iv
            };
        }

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: visibility.value === 'private' ? 'Encrypting and creating paste...' : 'Creating paste...',
                cancellable: false
            },
            async () => {
                const paste = await api.createPaste(pasteOptions);

                const webUrl = vscode.workspace.getConfiguration('pastezen').get<string>('webUrl');
                const url = `${webUrl}/pastes/${paste._id}`;

                // Copy URL to clipboard
                await vscode.env.clipboard.writeText(url);

                const message = visibility.value === 'private'
                    ? `🔒 Encrypted paste created! URL copied.`
                    : `Paste created! URL copied to clipboard.`;

                const action = await vscode.window.showInformationMessage(
                    message,
                    'Open in Browser',
                    'OK'
                );

                if (action === 'Open in Browser') {
                    vscode.env.openExternal(vscode.Uri.parse(url));
                }

                pastesProvider.refresh();
            }
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create paste: ${error.message}`);
    }
}

async function openContentInEditor(content: string, language: string, fileName: string, pasteId?: string, fileIndex?: number) {
    // Map language names to VS Code language IDs
    const languageMap: { [key: string]: string } = {
        'javascript': 'javascript',
        'typescript': 'typescript',
        'python': 'python',
        'java': 'java',
        'csharp': 'csharp',
        'cpp': 'cpp',
        'c': 'c',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'markdown': 'markdown',
        'plaintext': 'plaintext',
        'xml': 'xml',
        'yaml': 'yaml',
        'shell': 'shellscript',
        'bash': 'shellscript',
        'sql': 'sql',
        'php': 'php',
        'ruby': 'ruby',
        'go': 'go',
        'rust': 'rust',
        'swift': 'swift',
        'kotlin': 'kotlin'
    };

    const vscodeLang = languageMap[language.toLowerCase()] || 'plaintext';

    // Create untitled document with content
    const doc = await vscode.workspace.openTextDocument({
        content: content,
        language: vscodeLang
    });

    // Track this document if it's linked to a paste
    if (pasteId !== undefined && fileIndex !== undefined) {
        trackDocument(doc.uri, {
            pasteId,
            fileIndex,
            fileName,
            language
        });
    }

    await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: false
    });
}

export function deactivate() { }

