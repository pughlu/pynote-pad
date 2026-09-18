// src/ide/panels/config-panel.ts
// Pragmatic Programmer: Decoupled Inspector & Configuration Panel

import { EventBus } from '../event-bus';
import { IDEStore } from '../store';
import { CellConfig, IDEPanel } from '../types';

export class ConfigPanel implements IDEPanel {
    private container!: HTMLElement;
    private cellPanelEl!: HTMLElement;
    private cellIndicatorEl!: HTMLElement;

    // Cell controls
    private lockInput!: HTMLInputElement;
    private editInput!: HTMLInputElement;
    private deleteInput!: HTMLInputElement;
    private moveInput!: HTMLInputElement;
    private hideInput!: HTMLInputElement;
    private metaInput!: HTMLTextAreaElement;

    private bus: EventBus;
    private store: IDEStore;
    private unsubs: Array<() => void> = [];

    constructor(bus: EventBus, store: IDEStore) {
        this.bus = bus;
        this.store = store;
    }

    mount(container: HTMLElement): void {
        this.container = container;
        this.renderShell();
        this.bindEvents();
        this.syncGlobalUI();
        this.syncCellUI([]);
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <div class="panel-scroll-shell flex-1">
                <div class="panel-scroll-viewport flex flex-col p-0">
                    
                    <!-- Global Config Section -->
                    <div class="collapsible-section border-b border-slate-200">
                        <div id="global-config-header" class="px-3 py-2 bg-slate-50 font-semibold text-xs text-slate-500 uppercase tracking-wider cursor-pointer flex justify-between items-center select-none transition-colors hover:bg-slate-100">
                            <span>Global Config</span>
                            <svg class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                        <div id="global-config-body" class="p-4 flex flex-col gap-4 text-sm">
                            <div>
                                <label class="block font-medium text-slate-700 mb-1">Execution Kernel</label>
                                <select id="config-kernel" class="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded p-1.5 outline-none focus:ring-1 focus:ring-blue-500">
                                    <option value="skulpt">Skulpt (Fast)</option>
                                    <option value="pyodide">Pyodide (Full CPython)</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Autocomplete</label>
                                <select id="config-autocomplete" class="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded p-1.5 outline-none focus:ring-1 focus:ring-blue-500">
                                    <option value="custom">Standard (PyNote)</option>
                                    <option value="none">Disabled</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-slate-700 mb-1">Max Width (chars)</label>
                                <input type="number" id="config-maxwidth" class="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded p-1.5 outline-none focus:ring-1 focus:ring-blue-500" placeholder="80" value="80">
                                <p class="text-[10px] text-slate-400 mt-1 leading-tight">Width of the notebook. Use -1 for unlimited.</p>
                            </div>
                            
                            <hr class="border-slate-100">

                            <div class="flex flex-col gap-2.5 select-none">
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-topbar" class="w-4 h-4 text-blue-600 rounded"><span>Show Top Toolbar</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-sharebtn" class="w-4 h-4 text-blue-600 rounded"><span>Show Share Button</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-question" class="w-4 h-4 text-blue-600 rounded"><span>Enable Question Mode</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-lockkernel" class="w-4 h-4 text-blue-600 rounded"><span>Lock Kernel</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-readonly" class="w-4 h-4 text-blue-600 rounded"><span>Global Read-Only</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-lockmarkdown" class="w-4 h-4 text-blue-600 rounded"><span>Lock Markdown Cells</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-noinsert" class="w-4 h-4 text-blue-600 rounded"><span>Disable Cell Insertion</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-nodelete" class="w-4 h-4 text-blue-600 rounded"><span>Disable Cell Deletion</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="config-nomove" class="w-4 h-4 text-blue-600 rounded"><span>Disable Cell Movement</span></label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Cell Config Section -->
                    <div class="collapsible-section">
                        <div id="cell-config-header" class="px-3 py-2 bg-slate-50 font-semibold text-xs text-slate-500 uppercase tracking-wider cursor-pointer flex justify-between items-center select-none transition-colors hover:bg-slate-100">
                            <div class="flex items-center gap-2">
                                <span>Cell Config</span>
                                <span id="cell-config-indicator" class="text-[10px] px-1.5 py-0.5 bg-slate-200 rounded-sm text-slate-600 font-normal">None</span>
                            </div>
                            <svg class="w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                        <div id="cell-config-panel" class="p-4 flex flex-col gap-4 text-sm opacity-50 pointer-events-none transition-opacity">
                            <div class="text-xs text-slate-500 mb-1">Select a cell in the editor to configure it.</div>
                            
                            <div class="flex flex-col gap-2.5 select-none">
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="cell-config-locked" class="w-4 h-4 text-blue-600 rounded"><span class="font-medium text-slate-700">Locked (Overrides All)</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="cell-config-editable" class="w-4 h-4 text-blue-600 rounded" checked><span class="font-medium text-slate-700">Editable</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="cell-config-deletable" class="w-4 h-4 text-blue-600 rounded" checked><span class="font-medium text-slate-700">Deletable</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="cell-config-moveable" class="w-4 h-4 text-blue-600 rounded" checked><span class="font-medium text-slate-700">Moveable</span></label>
                                <label class="flex items-center gap-3 cursor-pointer"><input type="checkbox" id="cell-config-hidden" class="w-4 h-4 text-blue-600 rounded"><span class="font-medium text-slate-700">Hidden</span></label>
                            </div>
                            
                            <hr class="border-slate-100">
                            
                            <div>
                                <label class="block font-medium text-slate-700 mb-1">Custom Metadata (JSON)</label>
                                <textarea id="cell-config-metadata" placeholder='{"tags": ["autograder"]}' class="w-full bg-slate-50 border border-slate-300 text-slate-900 text-xs font-mono rounded p-2 min-h-[90px] resize-y outline-none focus:ring-1 focus:ring-blue-500"></textarea>
                                <div class="text-[10px] text-slate-400 mt-1">Must be valid JSON formatting.</div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        `;

        this.cellPanelEl = this.container.querySelector('#cell-config-panel') as HTMLElement;
        this.cellIndicatorEl = this.container.querySelector('#cell-config-indicator') as HTMLElement;

        this.lockInput = this.container.querySelector('#cell-config-locked') as HTMLInputElement;
        this.editInput = this.container.querySelector('#cell-config-editable') as HTMLInputElement;
        this.deleteInput = this.container.querySelector('#cell-config-deletable') as HTMLInputElement;
        this.moveInput = this.container.querySelector('#cell-config-moveable') as HTMLInputElement;
        this.hideInput = this.container.querySelector('#cell-config-hidden') as HTMLInputElement;
        this.metaInput = this.container.querySelector('#cell-config-metadata') as HTMLTextAreaElement;

        this.bindGlobalOptionInputs();
        this.bindCellInputs();
        this.bindSectionToggles();
    }

    private bindSectionToggles(): void {
        const toggleSection = (headerId: string, bodyId: string) => {
            const header = this.container.querySelector(`#${headerId}`);
            const body = this.container.querySelector(`#${bodyId}`);
            const icon = header?.querySelector('svg');
            if (header && body && icon) {
                header.addEventListener('click', () => {
                    body.classList.toggle('hidden');
                    icon.style.transform = body.classList.contains('hidden') ? 'rotate(-90deg)' : 'rotate(0deg)';
                });
            }
        };

        toggleSection('global-config-header', 'global-config-body');
        toggleSection('cell-config-header', 'cell-config-panel');
    }

    private bindGlobalOptionInputs(): void {
        const optionMap: Record<string, string> = {
            kernel: 'kernelType',
            autocomplete: 'autocompleteMode',
            maxwidth: 'maxWidthChars',
            topbar: 'showTopBar',
            sharebtn: 'showShareButton',
            question: 'questionMode',
            lockkernel: 'lockKernel',
            readonly: 'isReadOnly',
            lockmarkdown: 'lockAllMarkdown',
            noinsert: 'disableInsertAll',
            nodelete: 'disableDelete',
            nomove: 'disableMove'
        };

        Object.keys(optionMap).forEach(key => {
            const el = this.container.querySelector('#config-' + key) as HTMLInputElement;
            if (!el) return;

            el.addEventListener('change', () => {
                const optName = optionMap[key];
                const val = el.type === 'checkbox' ? el.checked : el.value;
                this.store.setOption(optName, val);
            });
        });
    }

    private bindCellInputs(): void {
        const onCellChange = () => {
            const indices = this.store.selectedCellIndices;
            if (!indices || indices.length === 0) return;

            let metaObj: Record<string, any> = {};
            const rawMeta = this.metaInput.value.trim();
            if (rawMeta) {
                try {
                    metaObj = JSON.parse(rawMeta);
                } catch {
                    return; // Wait for valid JSON
                }
            }

            const config: CellConfig = {
                isLocked: this.lockInput.checked,
                isEditable: this.editInput.checked,
                isDeletable: this.deleteInput.checked,
                isMoveable: this.moveInput.checked,
                isHidden: this.hideInput.checked,
                metadata: metaObj
            };

            // Emit to event bus -> handled by EditorPanel without direct DOM querying
            this.bus.emit('cell:update-config', { indices, config });
        };

        [this.lockInput, this.editInput, this.deleteInput, this.moveInput, this.hideInput].forEach(inp => {
            inp.addEventListener('change', onCellChange);
        });
        this.metaInput.addEventListener('change', onCellChange);
    }

    private bindEvents(): void {
        this.unsubs.push(
            this.bus.on('config:changed', () => this.syncGlobalUI()),
            this.bus.on('cell:selection-changed', ({ indices }) => this.syncCellUI(indices))
        );
    }

    private syncGlobalUI(): void {
        const opts = this.store.options;
        const setVal = (id: string, val: any) => {
            const el = this.container.querySelector('#config-' + id) as HTMLInputElement;
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!val;
            else el.value = val !== undefined ? String(val) : '';
        };

        setVal('kernel', opts.kernelType || 'skulpt');
        setVal('autocomplete', opts.autocompleteMode || 'custom');
        setVal('maxwidth', opts.maxWidthChars || 80);
        setVal('topbar', opts.showTopBar !== false);
        setVal('sharebtn', opts.showShareButton);
        setVal('question', opts.questionMode);
        setVal('lockkernel', opts.lockKernel);
        setVal('readonly', opts.isReadOnly);
        setVal('lockmarkdown', opts.lockAllMarkdown);
        setVal('noinsert', opts.disableInsertAll);
        setVal('nodelete', opts.disableDelete);
        setVal('nomove', opts.disableMove);
    }

    private syncCellUI(indices: number[] | readonly number[]): void {
        if (!indices || indices.length === 0) {
            this.cellPanelEl.classList.add('opacity-50', 'pointer-events-none');
            this.cellIndicatorEl.innerText = "None";
            this.lockInput.checked = false;
            this.editInput.checked = true;
            this.deleteInput.checked = true;
            this.moveInput.checked = true;
            this.hideInput.checked = false;
            this.metaInput.value = '';
            return;
        }

        this.cellPanelEl.classList.remove('opacity-50', 'pointer-events-none');
        this.cellIndicatorEl.innerText = indices.length === 1 ? `Cell #${indices[0] + 1}` : `${indices.length} Cells`;

        // Read attributes from the first selected cell via deserialized notebook
        const converter = window.NotebookFormatConverter;
        const cells = converter ? converter.deserializeFromFlat(this.store.activeContent) : [];
        const firstCell = cells[indices[0]];
        if (!firstCell) return;

        this.lockInput.checked = !!firstCell.isLocked;
        this.editInput.checked = firstCell.isEditable !== false;
        this.deleteInput.checked = firstCell.isDeletable !== false;
        this.moveInput.checked = firstCell.isMoveable !== false;
        this.hideInput.checked = !!firstCell.isHidden;

        const cleanMeta = { ...(firstCell.metadata || {}) };
        delete cleanMeta.locked;
        delete cleanMeta.editable;
        delete cleanMeta.deletable;
        delete cleanMeta.moveable;
        delete cleanMeta.hidden;
        delete cleanMeta.lang;

        this.metaInput.value = Object.keys(cleanMeta).length > 0 ? JSON.stringify(cleanMeta, null, 2) : '';
    }

    destroy(): void {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
    }
}
