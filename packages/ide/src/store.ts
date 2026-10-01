// src/ide/store.ts
// Pragmatic Programmer: Single Source of Truth & DRY State Management

import { EventBus } from './event-bus';
import { IDEState, IDEOptions, ViewMode } from './types';
import { StorageProvider } from './storage/types';
import { ICollaborationProvider, ICollaborativeDocument } from './collaboration/types';

const DEFAULT_NOTEBOOK_CONTENT = `# %% [markdown]
"""
### Welcome to PyNote!
"""

# %% [code]
print("Hello World!")`;

const DEFAULT_OPTIONS: IDEOptions = {
    showTopBar: true,
    kernelType: 'default',
    autocompleteMode: 'custom',
    showShareButton: false,
    lockKernel: false,
    questionMode: false,
    isReadOnly: false,
    disableInsertAll: false,
    disableDelete: false,
    disableMove: false,
    lockAllMarkdown: false,
    maxWidthChars: 80
};

export class IDEStore {
    private state: IDEState;
    private bus: EventBus;
    public collabDocs: Record<string, ICollaborativeDocument> = {};
    public collabProvider: ICollaborationProvider | null = null;

    constructor(bus: EventBus, initialFiles?: Record<string, string>, initialActiveFile?: string, collabProvider?: ICollaborationProvider | null) {
        this.bus = bus;
        this.collabProvider = collabProvider || null;
        const files = initialFiles || {
            'untitled': DEFAULT_NOTEBOOK_CONTENT
        };
        const activeFileName = initialActiveFile && files[initialActiveFile] ? initialActiveFile : Object.keys(files)[0] || 'untitled';

        // Initialize Collab Docs
        for (const [fileName, content] of Object.entries(files)) {
            if (this.collabProvider) {
                this.collabDocs[fileName] = this.collabProvider.createDocumentFromString(content);
            }
        }

        this.state = {
            files,
            activeFileName,
            viewMode: 'visual',
            options: { ...DEFAULT_OPTIONS },
            selectedCellIndices: [],
            selectedFiles: new Set<string>(),
            activeProvider: null,
            isSyncing: false
        };
    }

    getState(): Readonly<IDEState> {
        return this.state;
    }

    get files(): Readonly<Record<string, string>> {
        return this.state.files;
    }

    get activeFileName(): string {
        return this.state.activeFileName;
    }

    get activeContent(): string {
        const doc = this.collabDocs[this.state.activeFileName];
        return (doc && this.collabProvider) 
            ? this.collabProvider.serializeDocument(doc, this.state.options) 
            : this.state.files[this.state.activeFileName] || '';
    }

    get viewMode(): ViewMode {
        return this.state.viewMode;
    }

    get options(): Readonly<IDEOptions> {
        return this.state.options;
    }

    get selectedCellIndices(): Readonly<number[]> {
        return this.state.selectedCellIndices;
    }

    get selectedFiles(): Readonly<Set<string>> {
        return this.state.selectedFiles;
    }

    /**
     * Switch active file
     */
    setActiveFile(fileName: string): boolean {
        if (!this.state.files[fileName]) return false;
        if (this.state.activeFileName === fileName) return true;

        this.state.activeFileName = fileName;
        this.state.selectedCellIndices = [];
        this.bus.emit('file:selected', { fileName });
        this.bus.emit('cell:selection-changed', { indices: [] });
        return true;
    }

    /**
     * Update content of a file (default active file) - Legacy string method
     */
    updateContent(content: string, fileName?: string): void {
        const target = fileName || this.state.activeFileName;
        
        delete this.collabDocs[target];
        if (this.collabProvider) {
            this.collabDocs[target] = this.collabProvider.createDocumentFromString(content);
        }
        this.state.files[target] = content; // Keep sync for legacy
        
        try {
            const parsed = (window as any).NotebookFormatConverter.deserializeFromFlat(content);
            if (parsed && parsed.globalConfig) {
                this.setOptions(parsed.globalConfig);
            }
        } catch (e) {
            // ignore
        }
        
        this.bus.emit('file:content-updated', { fileName: target, content });
    }

    /**
     * Create a new file
     */
    createFile(preferredName?: string, content?: string): string {
        let name = preferredName || 'untitled';
        if (!preferredName || this.state.files[name]) {
            let i = 1;
            name = preferredName || 'untitled';
            while (this.state.files[name]) {
                name = preferredName ? `${preferredName} (${i})` : `untitled (${i})`;
                i++;
            }
        }

        const newContent = content !== undefined ? content : `# %% [markdown]\n"""\n### New Notebook\n"""\n\n# %% [code]\n`;
        this.state.files[name] = newContent;
        if (this.collabProvider) {
            this.collabDocs[name] = this.collabProvider.createDocumentFromString(newContent);
        }
        this.state.activeFileName = name;
        this.state.selectedCellIndices = [];

        this.bus.emit('file:created', { fileName: name });
        this.bus.emit('files:changed', { files: this.state.files, activeFileName: name });
        this.bus.emit('file:selected', { fileName: name });
        this.bus.emit('cell:selection-changed', { indices: [] });
        return name;
    }

    /**
     * Close/Delete a file
     */
    closeFile(fileName: string): void {
        if (!this.state.files[fileName]) return;

        if (this.collabDocs[fileName]) {
            delete this.collabDocs[fileName];
        }
        delete this.state.files[fileName];
        this.state.selectedFiles.delete(fileName);
        this.bus.emit('file:closed', { fileName });

        const remaining = Object.keys(this.state.files);
        if (remaining.length === 0) {
            // Guarantee at least one open file
            this.createFile('untitled');
        } else if (this.state.activeFileName === fileName) {
            const nextActive = remaining[remaining.length - 1];
            this.setActiveFile(nextActive);
            this.bus.emit('files:changed', { files: this.state.files, activeFileName: nextActive });
        } else {
            this.bus.emit('files:changed', { files: this.state.files, activeFileName: this.state.activeFileName });
        }
    }

    /**
     * Rename an existing file
     */
    renameFile(oldName: string, newName: string): boolean {
        if (!this.state.files[oldName] || !newName || newName === oldName) return false;
        if (this.state.files[newName]) return false; // Name collision

        this.state.files[newName] = this.state.files[oldName];
        delete this.state.files[oldName];

        if (this.collabDocs[oldName]) {
            this.collabDocs[newName] = this.collabDocs[oldName];
            delete this.collabDocs[oldName];
        }

        if (this.state.selectedFiles.has(oldName)) {
            this.state.selectedFiles.delete(oldName);
            this.state.selectedFiles.add(newName);
        }

        if (this.state.activeFileName === oldName) {
            this.state.activeFileName = newName;
        }

        this.bus.emit('file:renamed', { oldName, newName });
        this.bus.emit('files:changed', { files: this.state.files, activeFileName: this.state.activeFileName });
        return true;
    }

    /**
     * Switch view mode
     */
    setViewMode(viewMode: ViewMode): void {
        if (this.state.viewMode === viewMode) return;
        this.state.viewMode = viewMode;
        this.bus.emit('view:changed', { viewMode });
    }

    /**
     * Update global option
     */
    setOption(key: string, value: any): void {
        this.state.options[key] = value;
        this.bus.emit('config:option-updated', { key, value });
        this.bus.emit('config:changed', { options: this.state.options });
    }

    /**
     * Bulk update options (e.g. from notebook global config)
     */
    setOptions(options: Partial<IDEOptions>): void {
        this.state.options = { ...this.state.options, ...options };
        this.bus.emit('config:changed', { options: this.state.options });
    }

    /**
     * Update selected cell indices
     */
    setSelectedCellIndices(indices: number[]): void {
        this.state.selectedCellIndices = indices;
        this.bus.emit('cell:selection-changed', { indices });
    }

    /**
     * Toggle file selection for export
     */
    toggleFileSelection(fileName: string): void {
        if (this.state.selectedFiles.has(fileName)) {
            this.state.selectedFiles.delete(fileName);
            this.bus.emit('file:selection-toggled', { fileName, isSelected: false });
        } else {
            this.state.selectedFiles.add(fileName);
            this.bus.emit('file:selection-toggled', { fileName, isSelected: true });
        }
    }

    // --- STORAGE PROVIDER METHODS ---
    
    setCollaborationProvider(provider: ICollaborationProvider | null): void {
        this.collabProvider = provider;
        // Rebuild docs for all files
        for (const file of Object.keys(this.state.files)) {
            if (provider) {
                this.collabDocs[file] = provider.createDocumentFromString(this.state.files[file]);
            } else {
                delete this.collabDocs[file];
            }
        }
    }

    setStorageProvider(provider: StorageProvider | null): void {
        this.state.activeProvider = provider;
        this.bus.emit('provider:changed', { provider });
    }

    async syncFileToCloud(fileName: string): Promise<boolean> {
        const provider = this.state.activeProvider;
        if (!provider || !provider.isAuthenticated()) return false;
        
        const doc = this.collabDocs[fileName];
        const content = (doc && this.collabProvider) 
            ? this.collabProvider.serializeDocument(doc, this.state.options) 
            : this.state.files[fileName];
        if (content === undefined) return false;

        this.state.isSyncing = true;
        this.bus.emit('sync:start', undefined as void);
        
        try {
            // Very naive save for now; assumes fileName is used as fileId
            await provider.saveFile(fileName, content);
            this.state.isSyncing = false;
            this.bus.emit('sync:complete', undefined as void);
            return true;
        } catch (error: any) {
            this.state.isSyncing = false;
            this.bus.emit('sync:error', { error });
            return false;
        }
    }

    async loadFilesFromCloud(): Promise<void> {
        const provider = this.state.activeProvider;
        if (!provider || !provider.isAuthenticated()) return;
        
        this.state.isSyncing = true;
        this.bus.emit('sync:start', undefined as void);
        
        try {
            const files = await provider.listFiles();
            for (const file of files) {
                const content = await provider.readFile(file.id);
                this.state.files[file.name] = content;
                delete this.collabDocs[file.name];
                if (this.collabProvider) {
                    this.collabDocs[file.name] = this.collabProvider.createDocumentFromString(content);
                }
            }
            // Update active file if needed or trigger render
            this.bus.emit('files:changed', { files: this.state.files, activeFileName: this.state.activeFileName });
            this.state.isSyncing = false;
            this.bus.emit('sync:complete', undefined as void);
        } catch (error: any) {
            this.state.isSyncing = false;
            this.bus.emit('sync:error', { error });
        }
    }

    // --- URL COMPRESSION HELPERS (Pragmatic: encapsulated pure utilities) ---

    static async compressForURL(text: string): Promise<string> {
        return (window as any).NotebookFormatConverter.compressForURL(text);
    }

    static async decompressFromURL(base64UrlSafe: string): Promise<string | null> {
        return (window as any).NotebookFormatConverter.decompressFromURL(base64UrlSafe);
    }
}
