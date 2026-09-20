// src/ide/ide-main.ts
// Pragmatic Programmer: Orchestrator & Bootstrapper

import { EventBus } from './event-bus';
import { IDEStore } from './store';
import { NavbarPanel } from './panels/navbar';
import { FileExplorerPanel } from './panels/file-explorer';
import { EditorPanel } from './panels/editor-panel';
import { ConfigPanel } from './panels/config-panel';

import { StorageProviderRegistry } from './storage/registry';
import { OneDriveProvider } from './storage/onedrive-provider';
import { GoogleDriveProvider } from './storage/google-drive-provider';

export class PyNoteIDE {
    public bus: EventBus;
    public store: IDEStore;
    public providerRegistry: StorageProviderRegistry;

    public navbarPanel!: NavbarPanel;
    public fileExplorerPanel!: FileExplorerPanel;
    public editorPanel!: EditorPanel;
    public configPanel!: ConfigPanel;

    private splitInstance: any = null;

    constructor() {
        this.bus = new EventBus();
        this.store = new IDEStore(this.bus);
        
        // Initialize Registry and Providers
        this.providerRegistry = new StorageProviderRegistry();
        this.providerRegistry.register(new OneDriveProvider());
        this.providerRegistry.register(new GoogleDriveProvider());
    }

    async boot(): Promise<void> {
        // 1. Check URL parameters for shared compressed notebook
        const urlParams = new URLSearchParams(window.location.search);
        const compressedPayload = urlParams.get('nb');

        if (compressedPayload) {
            const decompressed = await IDEStore.decompressFromURL(compressedPayload);
            if (decompressed) {
                const shareName = 'shared_notebook.pynote.py';
                this.store.createFile(shareName, decompressed);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }

        // 2. Mount Navbar
        const navContainer = document.getElementById('navbar-container');
        if (navContainer) {
            this.navbarPanel = new NavbarPanel(this.bus, this.store);
            this.navbarPanel.mount(navContainer);
        }

        // 3. Mount File Explorer (LHS)
        const lhsContainer = document.getElementById('lhs-panel');
        if (lhsContainer) {
            this.fileExplorerPanel = new FileExplorerPanel(this.bus, this.store, this.providerRegistry);
            this.fileExplorerPanel.mount(lhsContainer);
        }

        // 4. Mount Editor (Center)
        const mainContainer = document.getElementById('main-panel');
        if (mainContainer) {
            this.editorPanel = new EditorPanel(this.bus, this.store);
            this.editorPanel.mount(mainContainer);
        }

        // 5. Mount Config Inspector (RHS)
        const rhsContainer = document.getElementById('rhs-panel');
        if (rhsContainer) {
            this.configPanel = new ConfigPanel(this.bus, this.store);
            this.configPanel.mount(rhsContainer);
        }

        // 6. Initialize Split.js on the rigid workspace container
        if (typeof (window as any).Split === 'function') {
            this.splitInstance = (window as any).Split(['#lhs-panel', '#main-panel', '#rhs-panel'], {
                sizes: [18, 62, 20],
                minSize: [0, 360, 0],
                gutterSize: 6,
                snapOffset: 40,
                onDragEnd: () => {
                    // Trigger reflow/layout notification if needed
                    window.dispatchEvent(new Event('resize'));
                }
            });
        }
    }
}

// Auto-boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const ide = new PyNoteIDE();
    ide.boot();
    (window as any).ide = ide;
});
