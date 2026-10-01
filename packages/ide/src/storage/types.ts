// src/ide/storage/types.ts
// Pragmatic Programmer: Interface Abstraction for Cloud Storage

export interface StorageProvider {
    id: string; // e.g., 'local', 'onedrive'
    name: string; // e.g., 'OneDrive'
    
    // Auth
    authenticate(): Promise<boolean>;
    isAuthenticated(): boolean;

    // File Operations
    listFiles(): Promise<Array<{ id: string, name: string, lastModified: number }>>;
    readFile(fileId: string): Promise<string>;
    saveFile(fileId: string, content: string): Promise<boolean>;
    createFile(name: string, content: string): Promise<{ id: string, name: string }>;
    deleteFile(fileId: string): Promise<boolean>;
}
