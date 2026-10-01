// src/ide/storage/onedrive-provider.ts
// Pragmatic Programmer: MSAL-Backed OneDrive Provider

import { StorageProvider } from './types';
import { PublicClientApplication, Configuration, AuthenticationResult } from '@azure/msal-browser';

const msalConfig: Configuration = {
    auth: {
        clientId: 'YOUR_CLIENT_ID', // TODO: User needs to replace this
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin
    },
    cache: {
        cacheLocation: 'sessionStorage' // This configures where your cache will be stored
    }
};

const loginRequest = {
    scopes: ['User.Read', 'Files.ReadWrite.All']
};

export class OneDriveProvider implements StorageProvider {
    public id = 'onedrive';
    public name = 'OneDrive';
    private msalInstance: PublicClientApplication;
    private account: any = null;

    constructor() {
        this.msalInstance = new PublicClientApplication(msalConfig);
    }

    async authenticate(): Promise<boolean> {
        try {
            await this.msalInstance.initialize();
            
            // Try silent first if we have accounts
            const currentAccounts = this.msalInstance.getAllAccounts();
            if (currentAccounts.length > 0) {
                this.account = currentAccounts[0];
                return true;
            }

            // Otherwise pop up
            const response = await this.msalInstance.loginPopup(loginRequest);
            if (response && response.account) {
                this.account = response.account;
                return true;
            }
            return false;
        } catch (error) {
            console.error('[OneDriveProvider] Auth Error:', error);
            return false;
        }
    }

    isAuthenticated(): boolean {
        return this.account !== null;
    }

    private async getToken(): Promise<string> {
        if (!this.account) throw new Error("Not authenticated");
        try {
            const response = await this.msalInstance.acquireTokenSilent({
                ...loginRequest,
                account: this.account
            });
            return response.accessToken;
        } catch (error) {
            console.warn('[OneDriveProvider] Silent token failed, trying popup', error);
            const response = await this.msalInstance.acquireTokenPopup({
                ...loginRequest,
                account: this.account
            });
            return response.accessToken;
        }
    }

    async listFiles(): Promise<Array<{ id: string; name: string; lastModified: number }>> {
        const token = await this.getToken();
        
        // Fetch files from the AppRoot or root. For PyNote, a dedicated folder is usually safer.
        // We'll just fetch root children for now.
        const response = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error(`Failed to list files: ${response.statusText}`);
        const data = await response.json();
        
        // Filter for PyNote files if we wanted to, or return all
        return data.value.map((item: any) => ({
            id: item.id,
            name: item.name,
            lastModified: new Date(item.lastModifiedDateTime).getTime()
        }));
    }

    async readFile(fileId: string): Promise<string> {
        const token = await this.getToken();
        // Microsoft Graph returns a @microsoft.graph.downloadUrl for file content,
        // or we can append /content
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error(`Failed to read file: ${response.statusText}`);
        return await response.text();
    }

    async saveFile(fileId: string, content: string): Promise<boolean> {
        const token = await this.getToken();
        // In MS Graph, you can PUT to /items/{id}/content for files under 4MB
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: content
        });

        if (!response.ok) throw new Error(`Failed to save file: ${response.statusText}`);
        return true;
    }

    async createFile(name: string, content: string): Promise<{ id: string; name: string }> {
        const token = await this.getToken();
        // Create by putting content to a named path in root
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${name}:/content`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: content
        });

        if (!response.ok) throw new Error(`Failed to create file: ${response.statusText}`);
        const data = await response.json();
        return { id: data.id, name: data.name };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        const token = await this.getToken();
        const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error(`Failed to delete file: ${response.statusText}`);
        return true;
    }
}
