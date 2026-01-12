import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';

export interface CreatePasteOptions {
    title: string;
    fileName: string;
    content: string;
    language: string;
    visibility?: 'public' | 'private';
    encryptionLevel?: 'aes' | 'des' | 'rc4';
    isPasswordProtected?: boolean;
    password?: string;
    salt?: string;
    iv?: string;
}

export class PastezenAPI {
    private client: AxiosInstance;

    constructor() {
        const apiUrl = vscode.workspace.getConfiguration('pastezen').get<string>('apiUrl');
        const apiToken = vscode.workspace.getConfiguration('pastezen').get<string>('apiToken');

        this.client = axios.create({
            baseURL: apiUrl,
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async createPaste(options: CreatePasteOptions) {
        const {
            title,
            fileName,
            content,
            language,
            visibility = 'public',
            encryptionLevel,
            isPasswordProtected = false,
            password,
            salt,
            iv
        } = options;

        const file: any = {
            name: fileName,
            content,
            language,
            isMain: true
        };

        // Add encryption metadata if encrypted
        if (salt && iv) {
            file.salt = salt;
            file.iv = iv;
        }

        const payload: any = {
            title,
            files: [file],
            visibility,
            isPasswordProtected
        };

        if (encryptionLevel) {
            payload.encryptionLevel = encryptionLevel;
        }

        if (password) {
            payload.password = password;
        }

        const response = await this.client.post('/api/pastes', payload);
        return response.data;
    }

    async listPastes() {
        const response = await this.client.get('/api/pastes');
        return response.data || [];
    }

    async deletePaste(pasteId: string) {
        await this.client.delete(`/api/pastes/${pasteId}`);
    }

    async updatePaste(pasteId: string, updates: any) {
        const response = await this.client.put(`/api/pastes/${pasteId}`, updates);
        return response.data;
    }

    async getPaste(pasteId: string) {
        const response = await this.client.get(`/api/pastes/${pasteId}`);
        return response.data;
    }

    /**
     * Unlock a password-protected paste
     * Backend verifies password with bcrypt and returns full paste data
     */
    async unlockPaste(pasteId: string, password: string) {
        const response = await this.client.post(`/api/pastes/${pasteId}/unlock`, {
            password
        });
        return response.data;
    }
}
