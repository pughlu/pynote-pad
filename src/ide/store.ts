// src/ide/store.ts
// Pragmatic Programmer: Single Source of Truth & DRY State Management

import { EventBus } from './event-bus';
import { IDEState, IDEOptions, ViewMode } from './types';

const DEFAULT_NOTEBOOK_CONTENT = `# %% [markdown]
"""
### Welcome to PyNote!
"""

# %% [code]
print("Hello World!")`;

const DEFAULT_OPTIONS: IDEOptions = {
    showTopBar: true,
    kernelType: 'skulpt',
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

    constructor(bus: EventBus, initialFiles?: Record<string, string>, initialActiveFile?: string) {
        this.bus = bus;
        const files = initialFiles || {
            'untitled': DEFAULT_NOTEBOOK_CONTENT
        };
        const activeFileName = initialActiveFile && files[initialActiveFile] ? initialActiveFile : Object.keys(files)[0] || 'untitled';

        this.state = {
            files,
            activeFileName,
            viewMode: 'visual',
            options: { ...DEFAULT_OPTIONS },
            selectedCellIndices: [],
            selectedFiles: new Set<string>()
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
        return this.state.files[this.state.activeFileName] || '';
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
     * Update content of a file (default active file)
     */
    updateContent(content: string, fileName?: string): void {
        const target = fileName || this.state.activeFileName;
        if (this.state.files[target] === content) return;

        this.state.files[target] = content;
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

    // --- URL COMPRESSION HELPERS (Pragmatic: encapsulated pure utilities) ---

    static async compressForURL(text: string): Promise<string> {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const buffer = await new Response(stream).arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    static async decompressFromURL(base64UrlSafe: string): Promise<string | null> {
        try {
            let base64 = base64UrlSafe.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            return await new Response(stream).text();
        } catch (err) {
            console.error("[IDEStore] Failed to decompress payload:", err);
            return null;
        }
    }
}
