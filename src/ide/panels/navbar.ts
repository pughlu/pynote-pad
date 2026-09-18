// src/ide/panels/navbar.ts
// Pragmatic Programmer: Encapsulated Navbar & Menu Controller

import { EventBus } from '../event-bus';
import { IDEStore } from '../store';
import { IDEPanel, ViewMode } from '../types';

export class NavbarPanel implements IDEPanel {
    private container!: HTMLElement;
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
        this.bindMenus();
        this.bindActions();
        this.bindEvents();
        this.syncViewChecks(this.store.viewMode);
    }

    private renderShell(): void {
        this.container.innerHTML = `
            <div class="font-bold px-3 text-white tracking-tight flex items-center gap-2 select-none">
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                </svg>
                PyNote
            </div>
            
            <!-- File Menu -->
            <div class="relative">
                <button id="menu-btn-file" class="menu-btn px-3 py-1 hover:bg-slate-700 hover:text-white rounded cursor-pointer outline-none transition-colors">File</button>
                <div id="dropdown-file" class="dropdown-menu absolute left-0 mt-1 w-64 bg-white text-slate-800 border border-slate-200 shadow-xl rounded-md hidden py-1 z-50">
                    <a href="#" id="menu-file-load" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Open Notebook...</a>
                    <hr class="border-slate-200 my-1">
                    <a href="#" id="menu-file-save-flat" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white flex justify-between">
                        <span>Save as .pynote.py</span> <span class="text-slate-400 text-[10px] mt-0.5">Flatfile</span>
                    </a>
                    <a href="#" id="menu-file-save-ipynb" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white flex justify-between">
                        <span>Save as .ipynb</span> <span class="text-slate-400 text-[10px] mt-0.5">Jupyter</span>
                    </a>
                    <hr class="border-slate-200 my-1">
                    <a href="#" id="menu-file-save-moodle" class="block px-4 py-1.5 hover:bg-fuchsia-600 hover:text-white flex justify-between text-fuchsia-700 font-medium">
                        <span>Export to Moodle XML</span>
                    </a>
                    <hr class="border-slate-200 my-1">
                    <a href="#" id="menu-file-share" class="block px-4 py-1.5 hover:bg-emerald-500 hover:text-white flex justify-between text-emerald-600 font-medium">
                        <span>Copy Shareable Link</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                        </svg>
                    </a>
                </div>
            </div>

            <!-- Edit Menu -->
            <div class="relative">
                <button id="menu-btn-edit" class="menu-btn px-3 py-1 hover:bg-slate-700 hover:text-white rounded cursor-pointer outline-none transition-colors">Edit</button>
                <div id="dropdown-edit" class="dropdown-menu absolute left-0 mt-1 w-64 bg-white text-slate-800 border border-slate-200 shadow-xl rounded-md hidden py-1 z-50">
                    <a href="#" id="menu-edit-split" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Split cell at cursor</a>
                    <a href="#" id="menu-edit-merge" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Merge cell with cell below</a>
                    <hr class="border-slate-200 my-1">
                    <a href="#" id="menu-edit-duplicate" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Duplicate Cell</a>
                    <a href="#" id="menu-edit-copy" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Copy Cell</a>
                    <a href="#" id="menu-edit-paste" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white">Paste Cell</a>
                    <a href="#" id="menu-edit-delete" class="block px-4 py-1.5 hover:bg-red-500 hover:text-white text-red-600">Delete Cell</a>
                    <hr class="border-slate-200 my-1">
                    <a href="#" id="menu-edit-move-new" class="block px-4 py-1.5 hover:bg-fuchsia-500 hover:text-white">Move Cell to New File</a>
                    <a href="#" id="menu-edit-move-all-new" class="block px-4 py-1.5 hover:bg-fuchsia-500 hover:text-white">Move All Cells Below to New File</a>
                </div>
            </div>

            <!-- View Menu -->
            <div class="relative">
                <button id="menu-btn-view" class="menu-btn px-3 py-1 hover:bg-slate-700 hover:text-white rounded cursor-pointer outline-none transition-colors">View</button>
                <div id="dropdown-view" class="dropdown-menu absolute left-0 mt-1 w-52 bg-white text-slate-800 border border-slate-200 shadow-xl rounded-md hidden py-1 z-50">
                    <a href="#" id="menu-view-visual" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                        <span>Visual Editor</span> <span id="check-view-visual" class="text-blue-500 font-bold view-check">✓</span>
                    </a>
                    <a href="#" id="menu-view-flatfile" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                        <span>.pynote.py (Raw)</span> <span id="check-view-flatfile" class="text-blue-500 font-bold hidden view-check">✓</span>
                    </a>
                    <a href="#" id="menu-view-jupyter" class="block px-4 py-1.5 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                        <span>.ipynb (Raw)</span> <span id="check-view-jupyter" class="text-blue-500 font-bold hidden view-check">✓</span>
                    </a>
                </div>
            </div>

            <!-- Settings Menu -->
            <div class="relative">
                <button id="menu-btn-settings" class="menu-btn px-3 py-1 hover:bg-slate-700 hover:text-white rounded cursor-pointer outline-none transition-colors">Settings</button>
                <div id="dropdown-settings" class="dropdown-menu absolute left-0 mt-1 w-64 bg-white text-slate-800 border border-slate-200 shadow-xl rounded-md hidden py-2 px-3 text-xs text-slate-500 z-50">
                    Use the right-hand panel to adjust live configuration.
                </div>
            </div>
        `;
    }

    private bindMenus(): void {
        const fileBtn = this.container.querySelector('#menu-btn-file') as HTMLElement;
        const fileDropdown = this.container.querySelector('#dropdown-file') as HTMLElement;
        const editBtn = this.container.querySelector('#menu-btn-edit') as HTMLElement;
        const editDropdown = this.container.querySelector('#dropdown-edit') as HTMLElement;
        const viewBtn = this.container.querySelector('#menu-btn-view') as HTMLElement;
        const viewDropdown = this.container.querySelector('#dropdown-view') as HTMLElement;
        const settingsBtn = this.container.querySelector('#menu-btn-settings') as HTMLElement;
        const settingsDropdown = this.container.querySelector('#dropdown-settings') as HTMLElement;

        const closeAll = () => {
            fileDropdown.classList.add('hidden');
            editDropdown.classList.add('hidden');
            viewDropdown.classList.add('hidden');
            settingsDropdown.classList.add('hidden');
            fileBtn.classList.remove('bg-slate-700', 'text-white');
            editBtn.classList.remove('bg-slate-700', 'text-white');
            viewBtn.classList.remove('bg-slate-700', 'text-white');
            settingsBtn.classList.remove('bg-slate-700', 'text-white');
        };

        const toggleMenu = (btn: HTMLElement, dropdown: HTMLElement, e: MouseEvent) => {
            e.stopPropagation();
            const isHidden = dropdown.classList.contains('hidden');
            closeAll();
            if (isHidden) {
                dropdown.classList.remove('hidden');
                btn.classList.add('bg-slate-700', 'text-white');
            }
        };

        fileBtn.onclick = (e) => toggleMenu(fileBtn, fileDropdown, e);
        editBtn.onclick = (e) => toggleMenu(editBtn, editDropdown, e);
        viewBtn.onclick = (e) => toggleMenu(viewBtn, viewDropdown, e);
        settingsBtn.onclick = (e) => toggleMenu(settingsBtn, settingsDropdown, e);

        document.addEventListener('click', closeAll);
        this.container.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).tagName !== 'A') e.stopPropagation();
            });
        });
    }

    private bindActions(): void {
        // Edit Actions
        this.container.querySelector('#menu-edit-split')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.splitCellAtCursor();
        });
        this.container.querySelector('#menu-edit-merge')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.mergeWithCellBelow();
        });
        this.container.querySelector('#menu-edit-duplicate')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.duplicateCell();
        });
        this.container.querySelector('#menu-edit-delete')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.deleteSelectedCell();
        });
        this.container.querySelector('#menu-edit-copy')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.copySelectedCell();
        });
        this.container.querySelector('#menu-edit-paste')?.addEventListener('click', (e) => {
            e.preventDefault();
            if ((window as any).notebookCore) (window as any).notebookCore.pasteCell();
        });
        this.container.querySelector('#menu-edit-move-new')?.addEventListener('click', (e) => {
            e.preventDefault();
            const core = (window as any).notebookCore;
            if (!core) return;
            const selected = core.getSelectedCell();
            if (!selected || selected.el.isLocked || selected.el.isDeletable === false) return;
            
            const data = selected.el.toJSON();
            if (selected.el.tagName.toLowerCase() === 'notebook-code-cell' && selected.el.editorView) {
                data.content = selected.el.editorView.state.doc.toString();
            }
            
            core.deleteSelectedCell();
            
            const newName = 'untitled (' + Math.floor(Math.random() * 1000) + ')';
            const flatContent = (window as any).NotebookFormatConverter.serializeToFlat({ cells: [data], globalConfig: this.store.options });
            this.store.updateContent(flatContent, newName);
            this.store.setActiveFile(newName);
        });
        this.container.querySelector('#menu-edit-move-all-new')?.addEventListener('click', (e) => {
            e.preventDefault();
            const core = (window as any).notebookCore;
            if (!core) return;
            const selected = core.getSelectedCell();
            if (!selected) return;

            const cells = core.toJSON();
            const cellsToMove = [];
            for (let i = selected.index; i < cells.length; i++) {
                const child = core.container.children[i];
                if (child.isLocked || child.isDeletable === false) continue; // Skip locked cells
                
                const data = child.toJSON();
                if (child.tagName.toLowerCase() === 'notebook-code-cell' && child.editorView) {
                    data.content = child.editorView.state.doc.toString();
                }
                cellsToMove.push(data);
            }
            
            if (cellsToMove.length === 0) return;

            // Delete moved cells from current core (in reverse order to avoid index shifting)
            for (let i = cells.length - 1; i >= selected.index; i--) {
                const child = core.container.children[i];
                if (!child.isLocked && child.isDeletable !== false) {
                    child.remove();
                }
            }
            core.selectedIndices = [];
            core.syncToServer();

            const newName = 'untitled (' + Math.floor(Math.random() * 1000) + ')';
            const flatContent = (window as any).NotebookFormatConverter.serializeToFlat({ cells: cellsToMove, globalConfig: this.store.options });
            this.store.updateContent(flatContent, newName);
            this.store.setActiveFile(newName);
        });

        // Open
        this.container.querySelector('#menu-file-load')?.addEventListener('click', (e) => {
            e.preventDefault();
            (document.getElementById('file-upload') as HTMLInputElement)?.click();
        });

        // Save Flatfile
        this.container.querySelector('#menu-file-save-flat')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.downloadFile(this.store.activeFileName + '.pynote.py', this.store.activeContent);
        });

        // Save Jupyter
        this.container.querySelector('#menu-file-save-ipynb')?.addEventListener('click', (e) => {
            e.preventDefault();
            const converter = window.NotebookFormatConverter;
            const parsedCells = converter ? converter.deserializeFromFlat(this.store.activeContent) : [];
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
            const json = JSON.stringify({
                cells,
                metadata: { language_info: { name: "python" } },
                nbformat: 4,
                nbformat_minor: 5
            }, null, 2);
            this.downloadFile(this.store.activeFileName + '.ipynb', json);
        });

        // Save Moodle XML
        this.container.querySelector('#menu-file-save-moodle')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.exportMoodleXML();
        });

        // Share link
        this.container.querySelector('#menu-file-share')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const btnSpan = (e.currentTarget as HTMLElement).querySelector('span');
            if (!btnSpan) return;
            const orig = btnSpan.innerText;
            btnSpan.innerText = "Compressing...";

            try {
                const compressed = await IDEStore.compressForURL(this.store.activeContent);
                const shareUrl = window.location.origin + window.location.pathname + '?nb=' + compressed;
                await navigator.clipboard.writeText(shareUrl);
                btnSpan.innerText = "Link Copied!";
                setTimeout(() => { btnSpan.innerText = orig; }, 2000);
            } catch (err) {
                console.error("Compression Error:", err);
                alert("Failed to generate share link.");
                btnSpan.innerText = orig;
            }
        });

        // View mode clicks
        this.container.querySelector('#menu-view-visual')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.store.setViewMode('visual');
        });
        this.container.querySelector('#menu-view-flatfile')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.store.setViewMode('flatfile');
        });
        this.container.querySelector('#menu-view-jupyter')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.store.setViewMode('jupyter');
        });
    }

    private bindEvents(): void {
        this.unsubs.push(
            this.bus.on('view:changed', ({ viewMode }) => {
                this.syncViewChecks(viewMode);
            })
        );
    }

    private syncViewChecks(mode: ViewMode): void {
        this.container.querySelectorAll('.view-check').forEach(el => el.classList.add('hidden'));
        this.container.querySelector('#check-view-' + mode)?.classList.remove('hidden');
    }

    private downloadFile(filename: string, content: string): void {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    private exportMoodleXML(): void {
        const opts = this.store.options;
        const attrMap: Record<string, string> = {
            kernelType: 'data-kernel-type',
            autocompleteMode: 'data-autocomplete-mode',
            showTopBar: 'data-show-top-bar',
            showShareButton: 'data-show-share-button',
            questionMode: 'data-question-mode',
            lockKernel: 'data-lock-kernel',
            isReadOnly: 'data-read-only',
            lockAllMarkdown: 'data-lock-markdown'
        };

        let attrs = 'style="white-space: pre-wrap; font-family: monospace;"';
        for (const [key, attr] of Object.entries(attrMap)) {
            if (opts[key] !== undefined) {
                attrs += ` ${attr}="${opts[key]}"`;
            }
        }

        let questionsXml = '';
        for (const [fName, fContent] of Object.entries(this.store.files)) {
            const flatData = fContent.replace(/]]>/g, ']]]]><![CDATA[>');
            const payloadHtml = `<pynote ${attrs}>\n${flatData}\n</pynote>\n<script src="https://pynote-pad.pages.dev/pynote-mdl-quiz.js"></script>`;

            questionsXml += `
  <question type="essay">
    <name>
      <text><![CDATA[${fName}]]></text>
    </name>
    <questiontext format="html">
      <text><![CDATA[${payloadHtml}]]></text>
    </questiontext>
    <responseformat>plain</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <attachments>0</attachments>
    <attachmentsrequired>0</attachmentsrequired>
  </question>`;
        }

        const xmlStr = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>${questionsXml}\n</quiz>`;
        this.downloadFile('pynote-moodle-bank.xml', xmlStr);
    }

    destroy(): void {
        this.unsubs.forEach(fn => fn());
        this.unsubs = [];
    }
}
