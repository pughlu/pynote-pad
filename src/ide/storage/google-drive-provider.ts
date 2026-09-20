// src/ide/storage/google-drive-provider.ts
// Pragmatic Programmer: GIS-Backed Google Drive Provider

import { StorageProvider } from './types';

const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; // TODO: Replace with actual Client ID
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export class GoogleDriveProvider implements StorageProvider {
    public id = 'google-drive';
    public name = 'Google Drive';
    private accessToken: string | null = null;
    private tokenClient: any = null;
    private folderIdCache: string | null = null;

    constructor() {
        // We defer loading the script until authenticate() to keep the initial bundle clean,
        // but for a faster popup, we could also load it here.
    }

    private loadGsiScript(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
            document.head.appendChild(script);
        });
    }

    async authenticate(): Promise<boolean> {
        try {
            await this.loadGsiScript();
            
            return new Promise((resolve) => {
                this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            this.accessToken = tokenResponse.access_token;
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    },
                    error_callback: () => {
                        resolve(false);
                    }
                });

                // Request an access token
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            });
        } catch (error) {
            console.error('[GoogleDriveProvider] Auth Error:', error);
            return false;
        }
    }

    isAuthenticated(): boolean {
        return this.accessToken !== null;
    }

    private async fetchDrive(url: string, options: RequestInit = {}): Promise<Response> {
        if (!this.accessToken) throw new Error("Not authenticated");
        
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`
        };
        
        return fetch(url, { ...options, headers });
    }

    private async getOrCreateStudioFolder(): Promise<string> {
        if (this.folderIdCache) return this.folderIdCache;

        const url = `https://www.googleapis.com/drive/v3/files?q=name='PyNoteStudio' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`;
        const response = await this.fetchDrive(url);
        
        if (!response.ok) throw new Error(`Failed to query folder: ${response.statusText}`);
        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
            this.folderIdCache = data.files[0].id;
            return this.folderIdCache!;
        }

        // Create folder
        const createUrl = 'https://www.googleapis.com/drive/v3/files';
        const createResponse = await this.fetchDrive(createUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'PyNoteStudio', mimeType: 'application/vnd.google-apps.folder' })
        });
        
        if (!createResponse.ok) throw new Error(`Failed to create folder: ${createResponse.statusText}`);
        const createData = await createResponse.json();
        this.folderIdCache = createData.id;
        return this.folderIdCache!;
    }

    async listFiles(): Promise<Array<{ id: string; name: string; lastModified: number }>> {
        const folderId = await this.getOrCreateStudioFolder();
        const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,modifiedTime)`;
        const response = await this.fetchDrive(url);
        
        if (!response.ok) throw new Error(`Failed to list files: ${response.statusText}`);
        const data = await response.json();
        
        return (data.files || []).map((file: any) => ({
            id: file.id,
            name: file.name,
            lastModified: new Date(file.modifiedTime).getTime()
        }));
    }

    async readFile(fileId: string): Promise<string> {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await this.fetchDrive(url);
        
        if (!response.ok) throw new Error(`Failed to read file: ${response.statusText}`);
        return await response.text();
    }

    async saveFile(fileId: string, content: string): Promise<boolean> {
        const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
        const response = await this.fetchDrive(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: content
        });

        if (!response.ok) throw new Error(`Failed to save file: ${response.statusText}`);
        return true;
    }

    async createFile(name: string, content: string): Promise<{ id: string; name: string }> {
        // Google Drive requires a multipart upload to set metadata (name) and content simultaneously,
        // or a two-step process. We'll do a simple POST for metadata, then PATCH content.
        
        const folderId = await this.getOrCreateStudioFolder();
        
        // 1. Create file metadata
        const metaUrl = 'https://www.googleapis.com/drive/v3/files';
        const metaResponse = await this.fetchDrive(metaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: 'text/plain', parents: [folderId] })
        });
        
        if (!metaResponse.ok) throw new Error(`Failed to create file metadata: ${metaResponse.statusText}`);
        const metaData = await metaResponse.json();
        
        // 2. Upload content
        await this.saveFile(metaData.id, content);
        
        return { id: metaData.id, name: metaData.name };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
        const response = await this.fetchDrive(url, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error(`Failed to delete file: ${response.statusText}`);
        return true;
    }
}
