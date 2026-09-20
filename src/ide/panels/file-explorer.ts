// src/ide/panels/file-explorer.ts
// Pragmatic Programmer: Encapsulated File Explorer Panel

import { EventBus } from '../event-bus';
import { IDEStore } from '../store';
import { IDEPanel } from '../types';
import { StorageProviderRegistry } from '../storage/registry';

export class FileExplorerPanel implements IDEPanel {
    private container!: HTMLElement;
    private fileListEl!: HTMLElement;
    private dropIndicatorEl!: HTMLElement;
    private bus: EventBus;
    private store: IDEStore;
    private registry: StorageProviderRegistry;
    private unsubs: Array<() => void> = [];

    constructor(bus: EventBus, store: IDEStore, registry: StorageProviderRegistry) {
        this.bus = bus;
        this.store = store;
        this.registry = registry;
    }

    mount(container: HTMLElement): void {
        this.container = container;
        this.renderShell();
        this.bindEvents();
        this.renderFileList();
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <!-- Panel Header -->
            <div class="px-3 py-2 border-b border-slate-200 bg-slate-50 font-semibold text-xs text-slate-500 uppercase tracking-wider flex justify-between items-center shrink-0 select-none">
                <div class="flex items-center gap-2">
                    <span>Files</span>
                    <button id="lhs-btn-cloud" class="text-blue-500 hover:text-blue-600 transition-colors p-0.5 rounded hidden" title="Connected to Cloud">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
                    </button>
                    <button id="lhs-btn-cloud-connect" class="text-slate-400 hover:text-blue-500 transition-colors p-0.5 rounded" title="Connect to Cloud Drive">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
                    </button>
                </div>
                <div class="flex gap-1">
                    <button id="lhs-btn-new" class="text-slate-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-slate-200" title="New File">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                    <button id="lhs-btn-upload" class="text-slate-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-slate-200" title="Upload File">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    </button>
                </div>
            </div>

            <!-- Absolute Inset Scroll Shell (Immune to parent flex blowout) -->
            <div class="panel-scroll-shell">
                <div id="lhs-file-viewport" class="panel-scroll-viewport p-2 flex flex-col min-h-0">
                    <div id="file-list" class="flex flex-col gap-0.5"></div>
                    <div id="drop-indicator" class="hidden h-full flex-col items-center justify-center text-slate-400 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50 m-2 min-h-[120px]">
                        <span class="text-sm font-medium">Drop file here</span>
                    </div>
                </div>
            </div>
        `;

        this.fileListEl = this.container.querySelector('#file-list') as HTMLElement;
        this.dropIndicatorEl = this.container.querySelector('#drop-indicator') as HTMLElement;

        // Button clicks
        this.container.querySelector('#lhs-btn-new')?.addEventListener('click', () => {
            this.store.createFile();
        });

        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        this.container.querySelector('#lhs-btn-upload')?.addEventListener('click', () => {
            fileInput?.click();
        });

        // Cloud Connection Logic (Dropdown for multiple providers)
        const connectBtn = this.container.querySelector('#lhs-btn-cloud-connect');
        connectBtn?.addEventListener('click', (e) => {
            const providers = this.registry.getAllProviders();
            if (providers.length === 0) {
                alert("No Cloud Storage Providers registered.");
                return;
            }

            // Remove existing dropdown if any
            const existing = document.getElementById('cloud-provider-dropdown');
            if (existing) existing.remove();

            // Create dropdown menu
            const dropdown = document.createElement('div');
            dropdown.id = 'cloud-provider-dropdown';
            dropdown.className = 'absolute top-10 left-3 bg-white border border-slate-200 rounded shadow-lg py-1 z-50 min-w-[150px]';
            
            providers.forEach(provider => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors';
                btn.innerText = `Connect ${provider.name}`;
                btn.onclick = async () => {
                    dropdown.remove();
                    try {
                        const success = await provider.authenticate();
                        if (success) {
                            this.store.setStorageProvider(provider);
                            await this.store.loadFilesFromCloud();
                        }
                    } catch (err) {
                        alert(`Failed to connect to ${provider.name}.`);
                        console.error(err);
                    }
                };
                dropdown.appendChild(btn);
            });

            // Close when clicking outside
            const closeDropdown = (evt: MouseEvent) => {
                if (!dropdown.contains(evt.target as Node) && (!connectBtn || !connectBtn.contains(evt.target as Node))) {
                    dropdown.remove();
                    document.removeEventListener('click', closeDropdown);
                }
            };
            // Use setTimeout to avoid closing it on the same click event
            setTimeout(() => {
                document.addEventListener('click', closeDropdown);
            }, 0);

            this.container.appendChild(dropdown);
        });
    }

    private bindEvents(): void {
        // Subscribe to store updates via EventBus
        this.unsubs.push(
            this.bus.on('files:changed', () => this.renderFileList()),
            this.bus.on('file:selected', () => this.renderFileList()),
            this.bus.on('file:selection-toggled', () => this.renderFileList()),
            this.bus.on('provider:changed', () => this.updateCloudIcon()),
            this.bus.on('sync:start', () => this.renderFileList()),
            this.bus.on('sync:complete', () => this.renderFileList())
        );

        // Drag & Drop
        const dropZone = this.container.querySelector('#lhs-file-viewport') as HTMLElement;
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.fileListEl.classList.add('hidden');
                this.dropIndicatorEl.classList.remove('hidden');
                this.dropIndicatorEl.classList.add('flex');
            });
            dropZone.addEventListener('dragleave', () => {
                this.fileListEl.classList.remove('hidden');
                this.dropIndicatorEl.classList.add('hidden');
                this.dropIndicatorEl.classList.remove('flex');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.fileListEl.classList.remove('hidden');
                this.dropIndicatorEl.classList.add('hidden');
                this.dropIndicatorEl.classList.remove('flex');
                if (e.dataTransfer?.files?.length) {
                    this.handleFileImport(e.dataTransfer.files[0]);
                }
            });
        }

        // Global file input
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files?.length) {
                    this.handleFileImport(target.files[0]);
                }
                target.value = '';
            });
        }
    }

    private updateCloudIcon(): void {
        const cloudBtn = this.container.querySelector('#lhs-btn-cloud') as HTMLElement;
        const connectBtn = this.container.querySelector('#lhs-btn-cloud-connect') as HTMLElement;
        
        // Use type assertion since IDEStore exposes it
        const provider = (this.store.getState() as any).activeProvider;
        if (provider && provider.isAuthenticated()) {
            cloudBtn.classList.remove('hidden');
            connectBtn.classList.add('hidden');
        } else {
            cloudBtn.classList.add('hidden');
            connectBtn.classList.remove('hidden');
        }
    }

    private renderFileList(): void {
        if (!this.fileListEl) return;
        this.fileListEl.innerHTML = '';

        const files = this.store.files;
        const activeName = this.store.activeFileName;
        const state = this.store.getState() as any;
        const isSyncing = state.isSyncing;

        Object.keys(files).forEach(fileName => {
            const isActive = fileName === activeName;
            const isSelected = this.store.selectedFiles.has(fileName);
            const btn = document.createElement('button');
            btn.className = `w-full text-left px-3 py-1.5 rounded text-sm truncate transition-colors flex items-center gap-2 group ${
                isActive ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-600'
            }`;

            const syncIcon = (isActive && isSyncing) ? 
                `<svg class="w-4 h-4 shrink-0 text-blue-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>` : 
                `<svg class="w-4 h-4 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;

            btn.innerHTML = `
                <input type="checkbox" class="file-select-cb mr-1 rounded" ${isSelected ? 'checked' : ''}>
                ${syncIcon}
                <span class="flex-1 truncate cursor-text" title="Double click to rename">${fileName}</span>
            `;

            btn.onclick = () => this.store.setActiveFile(fileName);

            const cb = btn.querySelector('.file-select-cb') as HTMLInputElement;
            if (cb) {
                cb.onclick = (e) => {
                    e.stopPropagation();
                    this.store.toggleFileSelection(fileName);
                };
            }

            const span = btn.querySelector('span');
            if (span) {
                span.ondblclick = (e) => {
                    e.stopPropagation();
                    this.startInlineRename(span, fileName);
                };
            }

            this.fileListEl.appendChild(btn);
        });
    }

    private startInlineRename(spanElement: HTMLElement, oldName: string): void {
        if (spanElement.querySelector('input')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'w-full bg-white border border-blue-400 outline-none px-1 rounded text-slate-800 focus:ring-2 focus:ring-blue-500 font-sans text-sm';
        input.style.minWidth = '50px';
        input.style.maxWidth = '150px';
        input.style.height = '20px';

        spanElement.innerHTML = '';
        spanElement.appendChild(input);
        input.focus();
        input.select();

        let isFinished = false;
        const finishRename = (save: boolean) => {
            if (isFinished) return;
            isFinished = true;
            if (save) {
                const newName = input.value.trim();
                if (newName && newName !== oldName) {
                    const success = this.store.renameFile(oldName, newName);
                    if (!success) {
                        alert("A file with this name already exists!");
                        spanElement.innerHTML = oldName;
                    }
                    return;
                }
            }
            spanElement.innerHTML = oldName;
        };

        input.onblur = () => finishRename(true);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishRename(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishRename(false);
            }
        };
        input.onclick = (e) => e.stopPropagation();
        input.ondblclick = (e) => e.stopPropagation();
    }

    private handleFileImport(file: File): void {
        const reader = new FileReader();
        reader.onload = (event) => {
            let content = event.target?.result as string;
            if (!content) return;

            const baseName = file.name.replace(/\.ipynb$/, '').replace(/\.pynote\.py$/, '');
            if (file.name.endsWith('.ipynb')) {
                try {
                    const ipynb = JSON.parse(content);
                    content = ipynb.cells.map((c: any) => {
                        const metaObj = { ...c.metadata };
                        delete metaObj.pynote_locked;
                        if (metaObj.editable === true) delete metaObj.editable;
                        if (metaObj.deletable === true) delete metaObj.deletable;
                        if (Array.isArray(metaObj.tags)) {
                            if (metaObj.tags.includes('locked')) {
                                metaObj.locked = true;
                                metaObj.tags = metaObj.tags.filter((t: string) => t !== 'locked');
                            }
                            if (metaObj.tags.length === 0) delete metaObj.tags;
                        }
                        const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
                        const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
                        return `# %% [${c.cell_type === 'markdown' ? 'markdown' : 'code'}]${metaStr}\n${src.replace(/\n+$/, '')}`;
                    }).join('\n\n');
                } catch (e) {
                    alert("Invalid Jupyter Notebook format");
                    return;
                }
            }

            this.store.createFile(baseName, content);
        };
        reader.readAsText(file);
    }

    destroy(): void {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
    }
}
