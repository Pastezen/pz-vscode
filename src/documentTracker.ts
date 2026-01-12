import * as vscode from 'vscode';

interface DocumentMetadata {
    pasteId: string;
    fileIndex: number;
    fileName: string;
    language: string;
}

// Map document URI to paste metadata
const documentMetadataMap = new Map<string, DocumentMetadata>();

export function trackDocument(uri: vscode.Uri, metadata: DocumentMetadata): void {
    documentMetadataMap.set(uri.toString(), metadata);
}

export function getDocumentMetadata(uri: vscode.Uri): DocumentMetadata | undefined {
    return documentMetadataMap.get(uri.toString());
}

export function removeDocumentMetadata(uri: vscode.Uri): void {
    documentMetadataMap.delete(uri.toString());
}

export function isTrackedDocument(uri: vscode.Uri): boolean {
    return documentMetadataMap.has(uri.toString());
}

export function getAllTrackedDocuments(): Map<string, DocumentMetadata> {
    return documentMetadataMap;
}
