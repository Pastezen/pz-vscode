import * as vscode from 'vscode';
import { PastezenAPI } from './api';
import { decryptContent } from './crypto';

export class PastesProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
        new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private pasteCache: Map<string, any> = new Map();
    private unlockedPastes: Map<string, { paste: any; passphrase: string }> = new Map();

    constructor(private api: PastezenAPI) { }

    refresh(): void {
        this.pasteCache.clear();
        this.unlockedPastes.clear();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        // If element is a paste, return its files
        if (element instanceof PasteItem) {
            try {
                // Check if it's a private paste that needs unlocking
                if (element.isPasswordProtected && !this.unlockedPastes.has(element.id)) {
                    // Prompt for password
                    const password = await vscode.window.showInputBox({
                        prompt: `🔐 Enter passphrase to unlock "${element.title}"`,
                        password: true,
                        ignoreFocusOut: true
                    });

                    if (!password) {
                        vscode.window.showWarningMessage('Paste access cancelled');
                        return [];
                    }

                    try {
                        const unlockedPaste = await this.api.unlockPaste(element.id, password);
                        this.unlockedPastes.set(element.id, { paste: unlockedPaste, passphrase: password });
                    } catch (error: any) {
                        vscode.window.showErrorMessage('Incorrect passphrase');
                        return [];
                    }
                }

                // Get paste data (from cache or unlocked)
                let paste = this.unlockedPastes.get(element.id)?.paste || this.pasteCache.get(element.id);
                if (!paste) {
                    paste = await this.api.getPaste(element.id);
                    this.pasteCache.set(element.id, paste);
                }

                if (paste.files && paste.files.length > 0) {
                    // Decrypt content if encrypted
                    const passphrase = this.unlockedPastes.get(element.id)?.passphrase;

                    return paste.files.map((file: any, index: number) => {
                        let content = file.content;

                        // Decrypt if we have passphrase and encryption metadata
                        if (passphrase && file.salt && file.iv) {
                            try {
                                content = decryptContent(file.content, passphrase, file.salt, file.iv);
                            } catch (decryptError) {
                                content = '[Decryption failed]';
                            }
                        }

                        return new FileItem(
                            file.name,
                            content,
                            file.language,
                            file.isMain,
                            element.id,
                            index,
                            element.isPasswordProtected
                        );
                    });
                }
                return [];
            } catch (error: any) {
                const is403 = error.response?.status === 403 || error.message?.includes('403');
                if (is403 && !this.unlockedPastes.has(element.id)) {
                    // Paste needs unlocking - prompt for password
                    const password = await vscode.window.showInputBox({
                        prompt: `🔐 Enter passphrase to unlock "${element.title}"`,
                        password: true,
                        ignoreFocusOut: true
                    });

                    if (password) {
                        try {
                            const unlockedPaste = await this.api.unlockPaste(element.id, password);
                            this.unlockedPastes.set(element.id, { paste: unlockedPaste, passphrase: password });

                            // Now return the files
                            if (unlockedPaste.files && unlockedPaste.files.length > 0) {
                                return unlockedPaste.files.map((file: any, index: number) => {
                                    let content = file.content;
                                    if (file.salt && file.iv) {
                                        try {
                                            content = decryptContent(file.content, password, file.salt, file.iv);
                                        } catch (e) {
                                            content = '[Decryption failed]';
                                        }
                                    }
                                    return new FileItem(file.name, content, file.language, file.isMain, element.id, index, true);
                                });
                            }
                        } catch (unlockError: any) {
                            vscode.window.showErrorMessage('Incorrect passphrase');
                        }
                    }
                }
                return [];
            }
        }

        // Root level - return pastes
        try {
            const pastes = await this.api.listPastes();
            return pastes.map((paste: any) => {
                const fileCount = paste.files?.length || 1;
                return new PasteItem(
                    paste.title || 'Untitled',
                    paste._id,
                    paste.createdAt,
                    paste.visibility || 'public',
                    paste.language || 'plaintext',
                    fileCount,
                    paste.isPasswordProtected || paste.visibility === 'private'
                );
            });
        } catch (error: any) {
            if (error.response?.status === 401) {
                vscode.window.showErrorMessage(
                    'Invalid API token. Please set your token.',
                    'Set Token'
                ).then(action => {
                    if (action === 'Set Token') {
                        vscode.commands.executeCommand('pastezen.setApiToken');
                    }
                });
            }
            return [];
        }
    }
}

type TreeItem = PasteItem | FileItem;

export class PasteItem extends vscode.TreeItem {
    constructor(
        public readonly title: string,
        public readonly id: string,
        public readonly createdAt: string,
        public readonly visibility: string,
        public readonly language: string,
        public readonly fileCount: number,
        public readonly isPasswordProtected: boolean = false
    ) {
        // Multi-file pastes are collapsible
        super(title, fileCount > 1
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );

        const date = new Date(createdAt);
        const timeAgo = getTimeAgo(date);

        // Show file count for multi-file pastes
        if (fileCount > 1) {
            this.description = `📁 ${fileCount} files • ${timeAgo}`;
        } else {
            this.description = `${timeAgo}`;
        }

        const lockIcon = isPasswordProtected ? '🔒 ' : '';
        this.tooltip = `${lockIcon}${title}\n📅 ${date.toLocaleString()}\n👁 ${visibility}\n📝 ${language}${fileCount > 1 ? `\n📁 ${fileCount} files` : ''}`;
        this.contextValue = isPasswordProtected ? 'paste-private' : 'paste';

        // Better icons
        if (isPasswordProtected) {
            this.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.red'));
        } else if (fileCount > 1) {
            this.iconPath = new vscode.ThemeIcon('folder-library', new vscode.ThemeColor('charts.yellow'));
        } else {
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.blue'));
        }

        // Single file pastes open directly on click
        if (fileCount <= 1) {
            this.command = {
                command: 'pastezen.openPasteInEditor',
                title: 'Open Paste',
                arguments: [this]
            };
        }
    }
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly fileName: string,
        public readonly content: string,
        public readonly language: string,
        public readonly isMain: boolean,
        public readonly pasteId: string,
        public readonly fileIndex: number,
        public readonly isEncrypted: boolean = false
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.description = isMain ? '⭐ main' : '';
        this.tooltip = `${fileName}\n📝 ${language}${isMain ? '\n⭐ Main file' : ''}${isEncrypted ? '\n🔒 Encrypted' : ''}`;
        this.contextValue = 'file';

        // Language-based icons
        this.iconPath = getFileIcon(language, fileName);

        // Click to open file
        this.command = {
            command: 'pastezen.openFileInEditor',
            title: 'Open File',
            arguments: [this]
        };
    }
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function getFileIcon(language: string, fileName: string): vscode.ThemeIcon {
    const iconMap: { [key: string]: string } = {
        'javascript': 'symbol-method',
        'typescript': 'symbol-method',
        'python': 'symbol-method',
        'java': 'symbol-class',
        'html': 'code',
        'css': 'symbol-color',
        'json': 'json',
        'markdown': 'markdown',
        'plaintext': 'file-text'
    };

    return new vscode.ThemeIcon(iconMap[language] || 'file-code');
}
