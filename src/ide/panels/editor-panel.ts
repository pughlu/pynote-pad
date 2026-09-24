// src/ide/panels/editor-panel.ts
// Pragmatic Programmer: Encapsulated Workspace & Editor Panel with Bulletproof Scroll Shell

import { EventBus } from '../event-bus';
import { IDEStore } from '../store';
import { CellConfig, IDEPanel, ViewMode } from '../types';
import '../../kernel-ui';

export class EditorPanel implements IDEPanel {
    private container!: HTMLElement;
    private tabBarEl!: HTMLElement;
    private scrollViewportEl!: HTMLElement;
    private visualWrapperEl!: HTMLElement;
    private rawWrapperEl!: HTMLElement;
    private rawTextareaEl!: HTMLTextAreaElement;
    private rawTitleEl!: HTMLElement;
    private mainHeaderEl!: HTMLElement;

    private bus: EventBus;
    private store: IDEStore;
    private unsubs: Array<() => void> = [];
    private currentRenderedFile: string | null = null;
    private currentRenderedViewMode: ViewMode = 'visual';

    constructor(bus: EventBus, store: IDEStore) {
        this.bus = bus;
        this.store = store;
    }

    mount(container: HTMLElement): void {
        this.container = container;
        this.renderShell();
        this.bindEvents();
        this.renderWorkspace();
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <!-- Browser-Style Tab Bar (Fixed height) -->
            <div id="tab-bar" class="bg-slate-200 flex items-end px-2 pt-2 gap-1 shrink-0 overflow-x-auto border-b border-slate-300 shadow-inner select-none"></div>

            <!-- Absolute Inset Scroll Shell (Rigid container preventing flex blowout) -->
            <div class="panel-scroll-shell">
                <div id="scroll-viewport" class="panel-scroll-viewport p-4 md:p-6 flex flex-col items-center">
                    
                    <!-- Visual Editor Wrapper (Grows to fit cells) -->
                    <div id="visual-editor-wrapper" class="w-full bg-white border border-slate-200 rounded-md shadow-sm flex flex-col shrink-0 min-h-[500px] mb-12 transition-all duration-300" style="max-width: 80ch;">
                        <header id="main-header" class="hidden bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shrink-0 rounded-t-md transition-all">
                            <div class="flex items-center gap-3">
                                <pynote-kernel-ui id="pynote-kernel-ui"></pynote-kernel-ui>
                            </div>
                            <div class="flex items-center gap-2">
                                <button id="btn-run-all" class="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors shadow-sm">
                                    Run All
                                </button>
                            </div>
                        </header>
                        <!-- PyNote notebook mounts here -->
                        <div id="pynote-mount-point" class="p-4 relative flex flex-col w-full box-border"></div>
                    </div>

                    <!-- Raw Text Editor Wrapper -->
                    <div id="raw-editor-wrapper" class="w-full h-full bg-white border border-slate-200 rounded-md shadow-sm flex-col hidden flex-1 mb-12 transition-all duration-300" style="max-width: 80ch;">
                        <div class="bg-slate-800 text-slate-200 px-4 py-2 text-xs font-mono rounded-t-md flex justify-between shrink-0">
                            <span id="raw-editor-title">raw mode</span>
                            <span class="text-slate-400">Edits are applied when switching views or tabs.</span>
                        </div>
                        <textarea id="raw-editor-textarea" spellcheck="false" class="flex-1 w-full p-4 font-mono text-sm outline-none bg-slate-50 text-slate-800 rounded-b-md focus:ring-2 focus:ring-inset focus:ring-blue-500 resize-none min-h-[400px]"></textarea>
                    </div>

                </div>
            </div>
        `;

        this.tabBarEl = this.container.querySelector('#tab-bar') as HTMLElement;
        this.scrollViewportEl = this.container.querySelector('#scroll-viewport') as HTMLElement;
        this.visualWrapperEl = this.container.querySelector('#visual-editor-wrapper') as HTMLElement;
        this.rawWrapperEl = this.container.querySelector('#raw-editor-wrapper') as HTMLElement;
        this.rawTextareaEl = this.container.querySelector('#raw-editor-textarea') as HTMLTextAreaElement;
        this.rawTitleEl = this.container.querySelector('#raw-editor-title') as HTMLElement;
        this.mainHeaderEl = this.container.querySelector('#main-header') as HTMLElement;

        // Toolbar actions
        this.container.querySelector('#btn-run-all')?.addEventListener('click', () => {
            if (window.notebookCore?.runAll) window.notebookCore.runAll();
        });
        const ui = this.container.querySelector('#pynote-kernel-ui');
        ui?.addEventListener('kernel-change', (e: any) => {
            this.store.setOption('kernelType', e.detail.kernel);
        });

        // Live typing listener on raw editor textarea
        this.rawTextareaEl.addEventListener('input', () => {
            if (this.currentRenderedViewMode === 'flatfile') {
                this.store.updateContent(this.rawTextareaEl.value, this.currentRenderedFile || this.store.activeFileName);
            }
        });

        // Expose triggerHostSync for live notebook keystrokes
        window.triggerHostSync = (flatfilePayload: string) => {
            if (this.currentRenderedViewMode === 'visual' || this.currentRenderedViewMode === 'preview') {
                this.store.updateContent(flatfilePayload, this.currentRenderedFile || this.store.activeFileName);
            }
        };
    }

    private bindEvents(): void {
        this.unsubs.push(
            this.bus.on('file:selected', () => {
                this.syncCurrentState();
                this.renderWorkspace();
            }),
            this.bus.on('files:changed', () => {
                this.renderTabs();
            }),
            this.bus.on('view:changed', () => {
                this.syncCurrentState();
                this.renderWorkspace();
            }),
            this.bus.on('workspace:sync-request', () => {
                this.syncCurrentState();
            }),
            this.bus.on('config:changed', (data) => {
                // Kernel selector UI is handled by pynote-kernel-ui
                const maxWidth = data.options.maxWidthChars;
                const widthStyle = maxWidth && maxWidth !== -1 && maxWidth !== '-1' ? `${maxWidth}ch` : '100%';
                if (this.visualWrapperEl) this.visualWrapperEl.style.maxWidth = widthStyle;
                if (this.rawWrapperEl) this.rawWrapperEl.style.maxWidth = widthStyle;

                if (this.mainHeaderEl) {
                    if (data.options.showTopBar !== false) this.mainHeaderEl.classList.remove('hidden');
                    else this.mainHeaderEl.classList.add('hidden');
                }
                
                if ((window as any).notebookCore) {
                    (window as any).notebookCore.options = { ...data.options };
                    (window as any).notebookCore.updateQuestionModeVisibility();
                    Array.from((window as any).notebookCore.container.children).forEach((cell: any) => {
                        if (cell.updateView) cell.updateView();
                    });
                }
            }),
            this.bus.on('cell:update-config', ({ indices, config }) => {
                this.applyCellConfig(indices, config);
            }),
            this.bus.on('cell:update-config-request', ({ indices, config, callback }) => {
                const success = this.applyCellConfig(indices, config);
                if (callback) callback(success);
            })
        );

        // Listen to custom event emitted by notebookCore for multi-select
        window.addEventListener('cell-selection-changed', (e: any) => {
            const indices = e.detail?.indices || [];
            this.store.setSelectedCellIndices(indices);
        });

        window.addEventListener('kernel-status-changed', (e: any) => {
            const isReady = e.detail?.isReady;
            this.bus.emit('kernel:status-changed', {
                isReady: !!isReady,
                text: isReady ? 'Ready' : 'Starting...'
            });
        });
    }

    public syncCurrentState(): boolean {
        const sourceMode = this.currentRenderedViewMode;
        const targetFile = this.currentRenderedFile || this.store.activeFileName;

        if ((sourceMode === 'visual' || sourceMode === 'preview') && (window as any).notebookCore) {
            // YDoc auto-syncs to IDEStore. We just ensure we have the latest.
            // If there's a flush needed, Yjs handles it in memory.
        } else if (sourceMode === 'flatfile') {
            const flat = this.rawTextareaEl.value;
            this.store.updateContent(flat, targetFile);
        } else if (sourceMode === 'jupyter') {
            try {
                const ipynb = JSON.parse(this.rawTextareaEl.value);
                const pynoteCells = ipynb.cells.map((c: any) => {
                    const type = c.cell_type === 'markdown' ? 'markdown' : 'code';
                    const str = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
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
                    if (type === 'code') return `# %% [code]${metaStr}\n${str.replace(/\n+$/, '')}`;
                    return `# %% [markdown]${metaStr}\n"""\n${str.replace(/\n+$/, '')}\n"""`;
                });
                this.store.updateContent(pynoteCells.join('\n\n'), targetFile);
            } catch (e) {
                alert("Invalid Jupyter JSON! Cannot apply changes. Please fix formatting.");
                return false;
            }
        }
        return true;
    }

    private renderWorkspace(): void {
        const viewMode = this.store.viewMode;
        const activeFile = this.store.activeFileName;
        const content = this.store.activeContent;
        const options = this.store.options;

        this.renderTabs();

        // Adjust max width
        const maxWidth = options.maxWidthChars;
        const widthStyle = maxWidth && maxWidth !== -1 && maxWidth !== '-1' ? `${maxWidth}ch` : '100%';
        this.visualWrapperEl.style.maxWidth = widthStyle;
        this.rawWrapperEl.style.maxWidth = widthStyle;

        if (viewMode === 'visual' || viewMode === 'preview') {
            this.rawWrapperEl.classList.add('hidden');
            this.rawWrapperEl.classList.remove('flex');
            this.visualWrapperEl.classList.remove('hidden');
            this.visualWrapperEl.classList.add('flex');

            if (options.showTopBar !== false) this.mainHeaderEl.classList.remove('hidden');
            else this.mainHeaderEl.classList.add('hidden');

            // Kernel selection UI updates are handled automatically by NotebookCore's pynote-kernel-ui element

            // Cleanup previous kernel worker to prevent memory leaks
            if (window.notebookCore?.kernel?.destroy) {
                window.notebookCore.kernel.destroy();
            }

            // Clean up mount point
            const oldMount = document.getElementById('pynote-mount-point');
            if (oldMount && oldMount.parentNode) {
                const newMount = oldMount.cloneNode(false) as HTMLElement;
                oldMount.parentNode.replaceChild(newMount, oldMount);
            }

            if (typeof (window as any).NotebookCore === 'function') {
                const coreOptions = { ...this.store.options };
                delete coreOptions.ignoreCellLocks;
                if (viewMode === 'visual') {
                    // Disable restrictions in visual editor so author can edit freely
                    coreOptions.ignoreCellLocks = true;
                    coreOptions.questionMode = false;
                    coreOptions.isReadOnly = false;
                    coreOptions.disableInsertAll = false;
                    coreOptions.disableDelete = false;
                    coreOptions.disableMove = false;
                    coreOptions.lockAllMarkdown = false;
                    coreOptions.disableTypeChange = false;
                } else {
                    coreOptions.ignoreCellLocks = false;
                }
                
                coreOptions.widgetId = activeFile;
                (window as any).notebookCore = new (window as any).NotebookCore('pynote-mount-point', coreOptions);
                
                const doc = this.store.collabDocs[activeFile];
                if (doc) {
                    (window as any).notebookCore.loadCollabDoc(doc);
                }
                
                // Keep config extraction using the legacy deserializer for now
                const parsedCells = window.NotebookFormatConverter.deserializeFromFlat(content || '');

                // Sync loaded file's global config back into store if present
                if (parsedCells.globalConfig) {
                    delete parsedCells.globalConfig.ignoreCellLocks;
                    delete parsedCells.globalConfig.widgetId;
                    this.store.setOptions(parsedCells.globalConfig);
                }
            }
            this.currentRenderedFile = activeFile;
            this.currentRenderedViewMode = viewMode;
        } else {
            this.visualWrapperEl.classList.add('hidden');
            this.visualWrapperEl.classList.remove('flex');
            this.rawWrapperEl.classList.remove('hidden');
            this.rawWrapperEl.classList.add('flex');

            if (viewMode === 'flatfile') {
                this.rawTitleEl.innerText = `${activeFile} (Flatfile Raw Mode)`;
                this.rawTextareaEl.value = content || '';
            } else if (viewMode === 'jupyter') {
                this.rawTitleEl.innerText = `${activeFile} (Jupyter JSON Raw Mode)`;
                const converter = window.NotebookFormatConverter;
                const parsedCells = converter ? converter.deserializeFromFlat(content || '') : [];
                const cells = parsedCells.map((c: any) => ({
                    cell_type: c.type === 'code' ? 'code' : 'markdown',
                    metadata: {
                        ...c.metadata,
                        ...(c.isEditable === false || c.isLocked ? { editable: false } : {}),
                        ...(c.isDeletable === false || c.isLocked ? { deletable: false } : {}),
                        ...(c.isLocked ? { tags: ['locked'] } : {})
                    },
                    source: c.content ? c.content.split('\n').map((l: string, i: number, arr: string[]) => l + (i === arr.length - 1 ? '' : '\n')) : [],
                    ...(c.type === 'code' ? { execution_count: null, outputs: [] } : {})
                }));
                this.rawTextareaEl.value = JSON.stringify({
                    cells,
                    metadata: { language_info: { name: "python" } },
                    nbformat: 4,
                    nbformat_minor: 5
                }, null, 2);
            }
            this.currentRenderedFile = activeFile;
            this.currentRenderedViewMode = viewMode;
        }
    }

    private renderTabs(): void {
        if (!this.tabBarEl) return;
        this.tabBarEl.innerHTML = '';

        const files = this.store.files;
        const activeName = this.store.activeFileName;

        Object.keys(files).forEach(fileName => {
            const isActive = fileName === activeName;
            const tab = document.createElement('div');
            tab.className = `flex items-center px-3 py-1.5 text-sm cursor-pointer select-none border-t border-x rounded-t-lg transition-colors ${
                isActive
                    ? 'bg-white border-slate-300 text-blue-600 font-medium translate-y-px z-10'
                    : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-50 border-b border-b-slate-300'
            }`;

            tab.innerHTML = `
                <svg class="w-4 h-4 mr-1.5 shrink-0 ${isActive ? 'text-blue-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <span class="truncate max-w-[120px] cursor-text" title="Double click to rename">${fileName}</span>
                <button class="ml-1.5 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-red-500 shrink-0" title="Close File">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `;

            tab.onclick = () => {
                if (fileName !== this.store.activeFileName) {
                    this.syncCurrentState();
                    this.store.setActiveFile(fileName);
                }
            };

            const closeBtn = tab.querySelector('button');
            if (closeBtn) {
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.store.closeFile(fileName);
                };
            }

            const span = tab.querySelector('span');
            if (span) {
                span.ondblclick = (e) => {
                    e.stopPropagation();
                    this.startInlineRename(span, fileName);
                };
            }

            this.tabBarEl.appendChild(tab);
        });
    }

    private startInlineRename(spanElement: HTMLElement, oldName: string): void {
        if (spanElement.querySelector('input')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'w-full bg-white border border-blue-400 outline-none px-1 rounded text-slate-800 focus:ring-2 focus:ring-blue-500 font-sans text-xs';
        input.style.minWidth = '50px';
        input.style.maxWidth = '120px';
        input.style.height = '18px';

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

    private applyCellConfig(indices: number[] | readonly number[], config: CellConfig): boolean {
        const mountPoint = document.getElementById('pynote-mount-point');
        if (!mountPoint) return false;

        const domCells = (window as any).notebookCore?.container 
            ? Array.from((window as any).notebookCore.container.children) as any[]
            : Array.from(mountPoint.children) as any[];

        if (!domCells || domCells.length === 0) return false;
        let anySuccess = false;

        indices.forEach(idx => {
            const cell = domCells[idx];
            if (!cell) return;
            anySuccess = true;

            if (config.isLocked !== undefined) {
                if (config.isLocked) cell.setAttribute('is-locked', '');
                else cell.removeAttribute('is-locked');
            }

            if (config.isEditable !== undefined) {
                if (!config.isEditable) cell.setAttribute('is-editable', 'false');
                else cell.removeAttribute('is-editable');
            }

            if (config.isDeletable !== undefined) {
                if (!config.isDeletable) cell.setAttribute('is-deletable', 'false');
                else cell.removeAttribute('is-deletable');
            }

            if (config.isMoveable !== undefined) {
                if (!config.isMoveable) cell.setAttribute('is-moveable', 'false');
                else cell.removeAttribute('is-moveable');
            }

            if (config.isHidden !== undefined) {
                if (config.isHidden) cell.setAttribute('is-hidden', '');
                else cell.removeAttribute('is-hidden');
            }

            if (config.metadata !== undefined) {
                cell.setAttribute('cell-metadata', JSON.stringify(config.metadata));
                cell.metadata = config.metadata;
            }
        });

        if (anySuccess) {
            this.syncCurrentState();
        }
        return anySuccess;
    }

    destroy(): void {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
    }
}
