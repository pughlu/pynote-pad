// src/ide/storage/registry.ts
// Pragmatic Programmer: Extensible Provider Registry

import { StorageProvider } from './types';

export class StorageProviderRegistry {
    private providers = new Map<string, StorageProvider>();

    register(provider: StorageProvider): void {
        this.providers.set(provider.id, provider);
    }

    getProvider(id: string): StorageProvider | undefined {
        return this.providers.get(id);
    }

    getAllProviders(): StorageProvider[] {
        return Array.from(this.providers.values());
    }
}
