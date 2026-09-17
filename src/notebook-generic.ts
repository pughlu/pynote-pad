window.MathJaxHelper = {
    queue: function (el, onComplete, retries = 0) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([el]).then(() => {
                if (onComplete) onComplete();
            }).catch(err => console.warn("MathJax error:", err));
        } else if (retries < 10) {
            setTimeout(() => this.queue(el, onComplete, retries + 1), 300);
        } else {
            console.warn(USER_MESSAGES.mathjaxSkipped);
            if (onComplete) onComplete();
        }
    }
};

// --- GLOBAL CONFIGURATION ---
const USER_MESSAGES = {
    kernelStarting: "Starting...",
    kernelLoadingPackages: "Loading Packages...",
    kernelReady: "Ready",
    kernelError: "Error",
    kernelNotReady: "Kernel is not ready yet.",
    skulptLoadFailed: "Failed to load Skulpt scripts",
    fileNotFound: "File not found: ",
    timeoutExceeded: "Cell runtime exceeded max limit (5s). Kernel restarted...",
    outputExceeded: "Cell output exceeded max limit. Kernel restarted...",
    mathjaxSkipped: "MathJax unavailable; skipping LaTeX typesetting."
};

const PYODIDE_CDN_URL = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

class PyodideWorkerKernel {
    isReady!: boolean;
    worker!: Worker | null;
    callbacks!: any;
    targetDivs!: any;
    currentOutputCounts!: any;
    options!: any;
    widgetId!: string;
    maxOutputChars!: number;
    kernelMode!: string;
    statusCallback!: any;

    constructor(options: any = {}) {
        this.isReady = false;
        this.worker = null;
        this.callbacks = {};
        this.targetDivs = {};
        this.currentOutputCounts = {};

        this.options = options;
        this.widgetId = options.widgetId || Math.random().toString(36).substring(2, 10);
        this.maxOutputChars = options.maxOutputChars || 50000;
        this.kernelMode = options.kernelMode || 'local';
    }

    async init(statusCallback) {
        // Store the callback so the handleMessage method can access it
        this.statusCallback = statusCallback;
        statusCallback('loading');

        try {
            // 1. Kill any existing worker if we are re-initializing (tab switching)
            if (this.worker) {
                this.worker.terminate();
            }

            // 2. Spawn the background worker as an ES Module
            this.worker = new Worker('pyodide-worker.js', { type: 'module' });

            // 3. Route all incoming worker messages to your existing robust handler
            this.worker.onmessage = (e) => this.handleMessage(e.data);

            // 4. THE MISSING PIECE: Tell the worker to start loading Pyodide!
            this.worker.postMessage({
                action: 'INIT',
                id: 'init',
                widgetId: this.widgetId,
                config: this.options
            });

        } catch (err) {
            console.error("Worker Initialization Error:", err);
            statusCallback('error');
        }
    }

    generateId() { return Math.random().toString(36).substring(2, 10); }

    writeOutput(id, text, classes) {
        const targetDiv = this.targetDivs[id];
        if (!targetDiv) return;

        this.currentOutputCounts[id] = (this.currentOutputCounts[id] || 0) + text.length;
        if (this.currentOutputCounts[id] > this.maxOutputChars) {
            if (this.currentOutputCounts[id] - text.length <= this.maxOutputChars) {
                const span = document.createElement('span');
                span.className = 'text-red-500 font-bold block mt-2';
                span.innerText = `[Error: Output exceeded maximum limit of ${this.maxOutputChars} characters]`;
                targetDiv.appendChild(span);
            }
            return;
        }

        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text + "\n";
        targetDiv.appendChild(span);
    }

    injectSvg(id, svgData) {
        const targetDiv = this.targetDivs[id];
        if (!targetDiv) return;

        const wrap = document.createElement('div');
        wrap.className = 'inline-block bg-white my-2 p-2 rounded shadow-sm border border-slate-200';
        wrap.innerHTML = svgData;
        const svgEl = wrap.querySelector('svg');
        if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
        targetDiv.appendChild(wrap);
    }

    handleMessage(msg) {
        const { id, type, status, text, error, data } = msg;

        if (type === 'status') {
            if (status === 'ready') this.isReady = true;
            if (status === 'error') this.isReady = false;

            if (this.statusCallback) this.statusCallback(status);

            if (status === 'ready' && this.callbacks[id]) {
                this.callbacks[id].resolve();
                delete this.callbacks[id];
            }
            return;
        }

        if (type === 'stdout') this.writeOutput(id, text, 'text-slate-700');
        if (type === 'stderr') this.writeOutput(id, text, 'text-red-500 font-semibold');
        if (type === 'svg') this.injectSvg(id, data);

        if (type === 'result') {
            const targetDiv = this.targetDivs[id];
            if (targetDiv) {
                const outWrap = document.createElement('div');
                outWrap.className = 'mt-1 font-mono text-sm text-slate-800';
                outWrap.innerText = text;
                targetDiv.appendChild(outWrap);
            }
        }

        if (type === 'success' || type === 'error') {
            if (this.callbacks[id]) {
                if (type === 'error') this.callbacks[id].reject(error);
                else this.callbacks[id].resolve();

                delete this.callbacks[id];
                delete this.targetDivs[id];
                delete this.currentOutputCounts[id];
            }
        }
    }

    execute(code, targetDiv) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) return reject(USER_MESSAGES.kernelNotReady);
            const execId = this.generateId();
            this.callbacks[execId] = { resolve, reject };
            this.targetDivs[execId] = targetDiv;
            this.currentOutputCounts[execId] = 0;
            this.worker.postMessage({ id: execId, widgetId: this.widgetId, action: 'EXECUTE', code: code, config: this.options });
        });
    }

    destroy() {
        if (this.worker && typeof this.worker.terminate === 'function') this.worker.terminate();
        this.isReady = false;
    }
}

// --- NEW: SKULPT KERNEL ADAPTER ---
class SkulptKernel {
    isReady!: boolean;
    currentOutputDiv!: any;
    maxOutputChars!: number;
    currentOutputCount!: number;
    isKilled!: boolean;
    executionHistory!: string[];
    capturingOutput!: boolean;

    constructor(options: any = {}) {
        this.isReady = false;
        this.currentOutputDiv = null;
        this.maxOutputChars = options.maxOutputChars || 50000;
        this.currentOutputCount = 0;
        this.isKilled = false;
        this.executionHistory = [];
        this.capturingOutput = true;
    }

    restart() {
        this.executionHistory = [];
    }

    async init(statusCallback) {
        statusCallback('loading');

        if (typeof Sk === 'undefined') {
            statusCallback('packages');
            try {
                await this.loadScript("https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js");
            } catch (e) {
                statusCallback('error');
                console.error(USER_MESSAGES.skulptLoadFailed);
                return;
            }
        }

        this.isReady = true;
        statusCallback('ready');
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    writeOutput(text, classes) {
        if (!this.currentOutputDiv) return;
        this.currentOutputCount += text.length;
        if (this.currentOutputCount > this.maxOutputChars) {
            this.isKilled = true;
            throw new Error(USER_MESSAGES.outputExceeded);
        }
        const span = document.createElement('span');
        span.className = classes;
        span.innerText = text;
        this.currentOutputDiv.appendChild(span);
    }

    async execute(code, targetDiv) {
        this.currentOutputDiv = targetDiv;
        this.currentOutputCount = 0;
        this.isKilled = false;

        const historyCode = this.executionHistory.join('\n');
        const historyLines = historyCode ? historyCode.split('\n').length + 1 : 0; // +1 for the separator
        this.capturingOutput = historyCode === '';

        Sk.configure({
            output: (text) => {
                if (!this.capturingOutput) {
                    if (text.includes("___BEGIN_OUTPUT___")) {
                        this.capturingOutput = true;
                        text = text.replace("___BEGIN_OUTPUT___", "");
                        if (!text) return;
                    } else {
                        return;
                    }
                }
                this.writeOutput(text, 'text-slate-700');
            },
            read: (x) => {
                if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw USER_MESSAGES.fileNotFound + "'" + x + "'";
                return Sk.builtinFiles["files"][x];
            },
            __future__: Sk.python3,
            execLimit: 5000,
            yieldLimit: 100,
            timeoutMsg: () => USER_MESSAGES.timeoutExceeded
        });

        // --- Skulpt Expression Evaluator (JupyterLab-style) ---
        let executableCode = code;
        const lines = code.split('\n');
        let isWrapped = false;
        let lastCodeIndex = -1;

        // Find the last line that has actual code, ignoring blank lines and comments
        for (let i = lines.length - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            if (trimmed !== '' && !trimmed.startsWith('#')) {
                lastCodeIndex = i;
                break;
            }
        }

        if (lastCodeIndex !== -1) {
            const lastCodeLine = lines[lastCodeIndex];
            const trimmed = lastCodeLine.trim();

            // Heuristic: Is it a top-level line? Does it lack assignments? Is it not a keyword?
            const sanitized = trimmed.replace(/(==|!=|<=|>=)/g, '  ');
            const hasAssignment = sanitized.includes('=');
            const isKeyword = /^(import|from|def|class|if|elif|else|for|while|try|except|finally|with|assert|pass|return|break|continue|yield|del|raise|global|nonlocal|print)\b/.test(trimmed);

            if (lastCodeLine && !/^\s/.test(lastCodeLine) && !hasAssignment && !isKeyword) {
                // If there is an inline comment (e.g. `x + 1 # comment`), strip it for eval()
                let evalExpr = trimmed;
                const hashIndex = evalExpr.indexOf('#');
                if (hashIndex !== -1) {
                    const beforeHash = evalExpr.substring(0, hashIndex);
                    const singleQuotes = (beforeHash.match(/'/g) || []).length;
                    const doubleQuotes = (beforeHash.match(/"/g) || []).length;
                    if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
                        evalExpr = beforeHash.trim();
                    }
                }

                if (evalExpr) {
                    isWrapped = true;
                    // Wrap the expression safely. If eval() fails, fall back to native execution.
                    // Include 'pass' in except to guarantee valid indentation even if fallback is empty or commented.
                    lines[lastCodeIndex] = `
try:
    __skulpt_res = eval(${JSON.stringify(evalExpr)})
    if __skulpt_res is not None:
        print(repr(__skulpt_res))
except BaseException:
    ${lastCodeLine}
    pass
`.trim();
                    executableCode = lines.join('\n');
                }
            }
        }

        if (historyCode) {
            executableCode = historyCode + '\nprint("___BEGIN_OUTPUT___", end="")\n' + executableCode;
        }

        try {
            await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, executableCode, true));
            if (code.trim()) {
                const indentedCode = code.split('\n').map(line => '    ' + line).join('\n');
                this.executionHistory.push(`try:\n${indentedCode}\nexcept BaseException:\n    pass`);
            }
        } catch (err) {
            if (this.isKilled) throw new Error(USER_MESSAGES.outputExceeded);

            let errStr = err.toString();
            let isFatalError = errStr.includes("SyntaxError") ||
                errStr.includes("IndentationError") ||
                errStr.includes("TabError") ||
                errStr.includes("ParseError") ||
                errStr.includes("Time limit");

            if (!isFatalError && code.trim()) {
                const indentedCode = code.split('\n').map(line => '    ' + line).join('\n');
                this.executionHistory.push(`try:\n${indentedCode}\nexcept BaseException:\n    pass`);
            }

            // Map the injected lines back to the original line numbers
            errStr = errStr.replace(/(?:on\s+<stdin>\s+on\s+line\s+|on\s+line\s+|line\s+)(\d+)/g, (match, lineNumStr) => {
                let lineNum = parseInt(lineNumStr, 10);
                if (isWrapped && lastCodeIndex !== -1) {
                    const wrappedStart = lastCodeIndex + 1 + historyLines;
                    if (lineNum >= wrappedStart && lineNum <= wrappedStart + 6) {
                        lineNum = wrappedStart;
                    } else if (lineNum > wrappedStart + 6) {
                        lineNum = lineNum - 6;
                    }
                }
                lineNum = Math.max(1, lineNum - historyLines);
                return "on line " + lineNum;
            });

            throw new Error(errStr.replace(/<stdin>/g, "line"));
        } finally {
            this.currentOutputDiv = null;
        }
    }

    destroy() {
        this.isReady = false;
    }
}

class BaseNotebookCell extends HTMLElement {
    _initialized!: boolean;
    actionBtnElement!: HTMLButtonElement | null;
    resizeObserver!: ResizeObserver | null;
    cellId!: string;
    cellType!: string;
    content!: string;
    isLocked!: boolean;
    isEditable!: boolean;
    isDeletable!: boolean;
    isMoveable!: boolean;
    isHidden!: boolean;
    mainBox!: HTMLDivElement;
    contentArea!: HTMLDivElement;
    botInserter?: HTMLDivElement;

    constructor() {
        super();
        this._initialized = false;
        this.actionBtnElement = null;
        this.resizeObserver = null;
    }

    connectedCallback() {
        if (this._initialized) return;
        this._initialized = true;

        this.cellId = this.getAttribute('cell-id') || Math.random().toString(36).substring(2, 9);
        this.cellType = this.getAttribute('cell-type') || 'text';
        this.content = this.getAttribute('content') || '';
        this.isLocked = this.hasAttribute('is-locked');
        this.isHidden = this.hasAttribute('is-hidden');
        // By default these are true, so we check if they are explicitly set to false
        this.isEditable = this.getAttribute('is-editable') !== 'false';
        this.isDeletable = this.getAttribute('is-deletable') !== 'false';
        this.isMoveable = this.getAttribute('is-moveable') !== 'false';

        this.renderShell();
        this.mountContent(this.contentArea);

        this.resizeObserver = new ResizeObserver(() => {
            this.dispatchAction('cell-height-changed');
        });

        if (this.mainBox) this.resizeObserver.observe(this.mainBox);
    }

    disconnectedCallback() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
    }

    dispatchAction(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: { id: this.cellId, ...detail }, bubbles: true, composed: true }));
    }

    renderShell() {
        this.className = 'cell-wrapper relative flex flex-col w-full my-1.5 group/wrapper block box-border';

        this.mainBox = document.createElement('div');
        this.mainBox.className = 'cell-container group/cell relative bg-white border border-slate-200 rounded-md shadow-sm flex items-stretch transition-all hover:border-slate-300 min-h-[1.75rem] box-border';

        const isReadOnlyGlobal = window.notebookCore && window.notebookCore.options && window.notebookCore.options.isReadOnly;
        // --- NEW: Grab the disableMove flag ---
        const disableMove = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableMove;

        if (this.isLocked || isReadOnlyGlobal) {
            this.mainBox.classList.add('bg-slate-50');
        }

        // --- UPDATED: Hide the drag handle if movement is disabled ---
        if (!this.isLocked && this.isMoveable && !isReadOnlyGlobal && !disableMove) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
            this.mainBox.appendChild(dragHandle);
        }

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';

        const disableTypeChange = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableTypeChange;
        const disableDelete = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableDelete;

        if (!this.isLocked && !isReadOnlyGlobal) {
            const toolbar = document.createElement('div');
            toolbar.className = 'cell-toolbar absolute z-40 flex items-center gap-1 bg-white/95 backdrop-blur-sm shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/cell:opacity-100 transition-all text-xs';

            if (!disableTypeChange) {
                const dropdownWrap = document.createElement('div');
                dropdownWrap.className = 'relative flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-slate-500 font-medium px-1 cursor-pointer';
                dropdownWrap.innerHTML = `
                    <span>${this.cellType}</span>
                    <svg class="w-3 h-3 ml-0.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    <select class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Change Cell Type">
                        <option value="code" ${this.cellType === 'code' ? 'selected' : ''}>code</option>
                        <option value="markdown" ${this.cellType === 'markdown' ? 'selected' : ''}>markdown</option>
                        <option value="text" ${this.cellType === 'text' ? 'selected' : ''}>text</option>
                    </select>
                `;
                (dropdownWrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
                    this.dispatchAction('cell-type-changed', { newType: (e.target as any).value, content: this.content });
                });
                toolbar.appendChild(dropdownWrap);
            }

            if (!disableDelete && this.isDeletable) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors ml-0.5 pl-1';
                if (!disableTypeChange) deleteBtn.classList.add('border-l', 'border-slate-200');
                deleteBtn.title = 'delete cell';
                deleteBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
                deleteBtn.onclick = () => this.dispatchAction('cell-deleted');
                toolbar.appendChild(deleteBtn);
            }

            // Only append the toolbar container if it actually has tools inside it!
            if (!disableTypeChange || (!disableDelete && this.isDeletable)) {
                this.contentArea.appendChild(toolbar);
            }
        }

        this.actionBtnElement = document.createElement('button');
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);

        const disableInsert = window.notebookCore && window.notebookCore.options && window.notebookCore.options.disableInsertAll;
        if (!isReadOnlyGlobal && !disableInsert) {
            this.botInserter = document.createElement('div');
            this.botInserter.className = 'absolute left-0 right-0 h-3 group-hover/inserter:h-6 transition-all duration-300 delay-0 group-hover/inserter:delay-250 flex items-center justify-center group/inserter cursor-pointer z-10 w-4/5 mx-auto';
            this.botInserter.style.top = 'calc(100% + 6px)';
            this.botInserter.style.transform = 'translateY(-50%)';
            this.botInserter.title = `Add cell below`;
            this.botInserter.innerHTML = `
                <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center"><div class="h-px w-full bg-transparent group-hover/inserter:bg-blue-400 transition-colors"></div></div>
                <div class="relative z-10 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md opacity-0 group-hover/inserter:opacity-100 transition-all duration-300 delay-0 group-hover/inserter:delay-250 mx-auto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"></path></svg>
                </div>
            `;
            this.botInserter.onclick = () => this.dispatchAction('cell-insert-below');
            if (this.cellType !== 'code') this.appendChild(this.botInserter);
        }
    }

    mountContent(container) { }
    handleActionClick() { }
    refresh() { }

    updateActionButton(config) {
        if (!this.actionBtnElement) return;
        if (config) {
            this.actionBtnElement.classList.remove('hidden');
            this.actionBtnElement.title = config.title;
            this.actionBtnElement.innerHTML = config.icon;
        } else {
            this.actionBtnElement.classList.add('hidden');
        }
    }

    setButtonState(state) {
        if (!this.actionBtnElement) return;
        const config = (this as any).getActionButtonConfig();
        if (state === 'running') {
            this.actionBtnElement.innerHTML = `<span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>`;
        } else if (state === 'success') {
            this.actionBtnElement.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
        } else if (config) {
            this.actionBtnElement.innerHTML = config.icon;
        }
    }

    toJSON() {
        return { 
            id: this.cellId, 
            type: this.cellType, 
            content: this.content, 
            isLocked: this.isLocked,
            isHidden: this.isHidden,
            isEditable: this.isEditable,
            isDeletable: this.isDeletable,
            isMoveable: this.isMoveable
        };
    }
}
window.BaseNotebookCell = BaseNotebookCell;

class NotebookCore {
    container!: HTMLElement;
    options!: NotebookConfig;
    isReadOnly!: boolean;
    defaultCellType!: string;
    activeCodeEditor!: any;
    kernel!: any;
    sortable!: any;
    selectedIndices!: number[];

    constructor(containerId: string, options: any = {}) {
        this.container = document.getElementById(containerId);

        const defaultConfig = {
            widgetId: Math.random().toString(36).substring(2, 10),
            isReadOnly: false,
            questionMode: false, // <-- NEW Macro Flag
            defaultCellType: 'code',
            kernelType: 'pyodide',
            kernelMode: 'local',
            preloadMatplotlib: true,
            maxOutputChars: 50000,
            enableTracing: true,
            maxRuntime: 15.0,
            disableInsertAll: false,
            disableInsertTop: false,
            disableDelete: false,
            disableMove: false,  // <-- NEW Flag
            outputCurtailThresholdLines: 40,
            outputCurtailShowLines: 10,
            outputLineHeightPx: 21,
            autoClearOutputOnEdit: true,
            showTopBar: false,
            lockAllMarkdown: false,
            lockKernel: false,
            disableTypeChange: false,
            layout: 'inline',
            autocompleteMode: 'custom'
        };

        // --- NEW: The Question Mode Macro ---
        // If questionMode is requested, we rewrite the defaults to be strict.
        if (options.questionMode) {
            defaultConfig.lockAllMarkdown = true;
            defaultConfig.disableMove = true;
            defaultConfig.disableDelete = true;
            defaultConfig.disableTypeChange = true;
            defaultConfig.disableInsertAll = true;
            defaultConfig.disableInsertTop = true;
        }

        // Merge the incoming options OVER the new defaults. 
        // This allows a user to specify {"questionMode": true, "disableInsertAll": false} 
        // and successfully override the strict default!
        this.options = { ...defaultConfig, ...options };

        this.isReadOnly = this.options.isReadOnly;
        this.defaultCellType = this.options.defaultCellType;
        this.activeCodeEditor = null;
        this.selectedIndices = [];

        const topInserter = document.getElementById('top-inserter');
        if (topInserter) {
            if (this.isReadOnly || this.options.disableInsertAll || this.options.disableInsertTop) {
                topInserter.style.display = 'none';
            } else {
                topInserter.style.display = 'flex';
                topInserter.onclick = () => this.addCell(this.defaultCellType, 0);
            }
        }

        const selector = document.getElementById('kernel-selector');
        if (selector) {
            (selector as any).value = this.options.kernelType;
            if (this.options.lockKernel) {
                (selector as HTMLSelectElement).disabled = true;
                selector.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                (selector as HTMLSelectElement).disabled = false;
                selector.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        this.initKernel();
        this.setupEventListeners();

        document.fonts.ready.then(() => {
            Array.from(this.container.children).forEach(cell => { if ((cell as any).refresh) (cell as any).refresh(); });
            if (typeof sendHeight === 'function') sendHeight();
        });
    }

    // --- NEW: Dynamic Kernel Initialization ---
    initKernel() {
        if (this.options.kernelType === 'skulpt') {
            this.kernel = new SkulptKernel(this.options);
        } else {
            this.kernel = new PyodideWorkerKernel(this.options);
        }
        this.kernel.init((status) => this.updateKernelStatus(status));
    }

    // --- NEW: Live Switcher Logic ---
    switchKernel(newType) {
        if (this.options.lockKernel) return;
        if (this.options.kernelType === newType) return;
        this.options.kernelType = newType;

        const selector = document.getElementById('kernel-selector');
        if (selector) (selector as any).value = newType;

        this.restartKernel();
    }

    setupEventListeners() {
        if ((this.container as any)._hasEventListeners) return;
        (this.container as any)._hasEventListeners = true;

        this.container.addEventListener('mousedown', (e) => {
            const cellElement = (e.target as Element).closest('notebook-code-cell, notebook-markdown-cell');
            if (!cellElement) return;
            
            const children = Array.from(this.container.children);
            const index = children.indexOf(cellElement as any);
            if (index === -1) return;
            
            let selectionChanged = false;
            
            if (e.shiftKey && this.selectedIndices.length > 0) {
                // Range selection
                const lastIndex = this.selectedIndices[this.selectedIndices.length - 1];
                const start = Math.min(lastIndex, index);
                const end = Math.max(lastIndex, index);
                this.selectedIndices = [];
                for (let i = start; i <= end; i++) {
                    this.selectedIndices.push(i);
                }
                selectionChanged = true;
                e.preventDefault(); // Prevent text selection when shift clicking
            } else if (e.metaKey || e.ctrlKey) {
                // Toggle selection
                const pos = this.selectedIndices.indexOf(index);
                if (pos === -1) {
                    this.selectedIndices.push(index);
                } else {
                    this.selectedIndices.splice(pos, 1);
                }
                selectionChanged = true;
            } else {
                // Standard click
                if (this.selectedIndices.length !== 1 || this.selectedIndices[0] !== index) {
                    this.selectedIndices = [index];
                    selectionChanged = true;
                }
            }
            
            if (selectionChanged) {
                this.updateCellSelectionVisuals();
                window.dispatchEvent(new CustomEvent('cell-selection-changed', { detail: { indices: [...this.selectedIndices] } }));
            }
        }, true); // Capture phase to catch it before CodeMirror might stop propagation

        this.container.addEventListener('cell-content-changed', () => this.syncToServer());
        this.container.addEventListener('cell-height-changed', () => {
            if (typeof sendHeight === 'function') requestAnimationFrame(sendHeight);
        });

        this.container.addEventListener('cell-deleted', (e) => {
            if (this.options.disableDelete) return; // <-- LOGIC SAFEGUARD

            const el = (e.target as any);
            if (!this.isReadOnly && el && !el.isLocked && el.isDeletable) {
                el.remove();
                this.syncToServer();
            }
        });

        this.container.addEventListener('cell-insert-below', (e) => {
            if (this.isReadOnly || this.options.disableInsertAll) return;
            const el = (e.target as any);
            const newCell = this.createCellElement({ type: 'code', content: '' });
            el.insertAdjacentElement('afterend', newCell);
            this.syncToServer();
            setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 50);
        });

        this.container.addEventListener('cell-type-changed', (e) => {
            if (this.isReadOnly) return;
            const oldEl = (e.target as any);
            if (oldEl.isLocked || !oldEl.isMoveable) return;

            const newType = ((e as any).detail as any).newType;
            const content = ((e as any).detail as any).content;

            const newCell = this.createCellElement({ type: newType, content: content, isEditing: newType === 'markdown' });
            this.container.insertBefore(newCell, oldEl);
            oldEl.remove();
            this.syncToServer();
            setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 50);
        });
    }

    updateKernelStatus(status) {
        // Target the internal indicator element inside our new wrapper
        const el = document.getElementById('kernel-status-indicator');
        if (!el) return;

        if (status === 'loading') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-yellow-500 inline-block animate-pulse"></span> ${USER_MESSAGES.kernelStarting}`;
        else if (status === 'packages') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-blue-500 inline-block animate-pulse"></span> ${USER_MESSAGES.kernelLoadingPackages}`;
        else if (status === 'ready') el.innerHTML = `<span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span> ${USER_MESSAGES.kernelReady}`;
        else el.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span> ${USER_MESSAGES.kernelError}`;

        if (status === 'ready') {
            window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: true } }));
        }
    }

    async restartKernel() {
        if (this.isReadOnly) return;
        this.updateKernelStatus('loading');

        Array.from(this.container.children).forEach(cell => {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell' && (cell as any).clearOutput) {
                (cell as any).clearOutput();
                (cell as any).updateKernelUIState(false);
            }
        });

        if (this.kernel && typeof this.kernel.destroy === 'function') {
            this.kernel.destroy();
        }

        // Re-initialize using the currently selected type
        this.initKernel();
    }

    updateCellSelectionVisuals() {
        const children = Array.from(this.container.children);
        children.forEach((cell, idx) => {
            const isSelected = this.selectedIndices.includes(idx);
            const wrapper = cell.firstElementChild; // The cell-wrapper div
            if (wrapper) {
                if (isSelected) {
                    wrapper.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-50', 'z-20');
                    wrapper.classList.remove('border-slate-200');
                    wrapper.classList.add('border-transparent');
                } else {
                    wrapper.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-50', 'z-20', 'border-transparent');
                    wrapper.classList.add('border-slate-200');
                }
            }
        });
    }

    loadData(cellDataArray: any) {
        this.container.innerHTML = '';

        // Merge file-level config into options.
        // Existing options (widget/HTML config) take precedence over the file config.
        if (cellDataArray.globalConfig) {
            this.options = { ...cellDataArray.globalConfig, ...this.options };
        }

        cellDataArray.forEach(data => {
            this.container.appendChild(this.createCellElement(data));
        });
        
        this.applyMaxWidth();
        this.setupDragAndDrop();
    }

    applyMaxWidth() {
        const wrapper = document.getElementById('visual-editor-wrapper');
        const rawWrapper = document.getElementById('raw-editor-wrapper');
        
        let maxWidth = 80;
        if (this.options && this.options.maxWidthChars !== undefined) {
            maxWidth = typeof this.options.maxWidthChars === 'string' ? parseInt(this.options.maxWidthChars, 10) : this.options.maxWidthChars;
        }

        if (wrapper && rawWrapper) {
            if (maxWidth === -1 || isNaN(maxWidth)) {
                wrapper.style.maxWidth = '100%';
                rawWrapper.style.maxWidth = '100%';
            } else {
                wrapper.style.maxWidth = `${maxWidth}ch`;
                rawWrapper.style.maxWidth = `${maxWidth}ch`;
            }
        }
    }

    createCellElement(data) {
        let tagName = 'notebook-text-cell';
        if (data.type === 'markdown') tagName = 'notebook-markdown-cell';
        if (data.type === 'code') tagName = 'notebook-code-cell';

        const cell = document.createElement(tagName);
        cell.setAttribute('cell-id', data.id || Math.random().toString(36).substring(2, 9));
        cell.setAttribute('cell-type', data.type || 'text');
        cell.setAttribute('content', data.content || '');
        if (data.output) cell.setAttribute('output', data.output);
        if (data.isEditing) cell.setAttribute('is-editing', '');
        if (data.isLocked) cell.setAttribute('is-locked', '');
        if (data.isHidden) cell.setAttribute('is-hidden', '');
        if (data.isEditable === false) cell.setAttribute('is-editable', 'false');
        if (data.isDeletable === false) cell.setAttribute('is-deletable', 'false');
        if (data.isMoveable === false) cell.setAttribute('is-moveable', 'false');
        return cell;
    }

    addCell(type = 'code', index = 0) {
        if (this.isReadOnly || this.options.disableInsertAll) return;
        const newCell = this.createCellElement({ type: type, content: '', isEditing: type === 'markdown' });

        if (this.container.children.length === 0 || index >= this.container.children.length) {
            this.container.appendChild(newCell);
        } else {
            this.container.insertBefore(newCell, this.container.children[index]);
        }

        this.syncToServer();
        setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 100);
    }

    async runAll() {
        if (this.kernel && typeof (this.kernel as any).restart === 'function') {
            (this.kernel as any).restart();
        }
        const cells = Array.from(this.container.children);
        for (const cell of cells) {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell') {
                if ((cell as any).refresh) (cell as any).refresh();
                const content = (cell as any).editorView ? (cell as any).editorView.state.doc.toString() : (cell as any).content;
                if (!content || content.trim() === '') continue;
                if ((cell as any).handleActionClick) await (cell as any).handleActionClick();
            }
        }
    }

    setupDragAndDrop() {
        // --- UPDATED: Prevent SortableJS from running if disableMove is active ---
        if (this.isReadOnly || this.options.disableMove || this.sortable || typeof Sortable === 'undefined') return;

        this.sortable = new Sortable(this.container, {
            handle: '.drag-handle',
            animation: 150,
            filter: '[is-locked]',
            onEnd: () => {
                const cells = Array.from(this.container.children);
                cells.forEach(cell => { if ((cell as any).refresh) (cell as any).refresh(); });
                this.syncToServer();
            },
        });
    }

    serializeToFlat() {
        const cells: any = this.toJSON();
        // Export the active configuration so the resulting flatfile is self-contained
        cells.globalConfig = { ...this.options };
        return (window as any).NotebookFormatConverter.serializeToFlat(cells);
    }

    deserializeFromFlat(payload) {
        return window.NotebookFormatConverter.deserializeFromFlat(payload, this.options);
    }

    toJSON() { return Array.from(this.container.children).map(c => (c as any).toJSON()); }

    syncToServer() {
        if (typeof window.triggerHostSync === 'function') {
            window.triggerHostSync(this.serializeToFlat());
        }
    }
}
window.NotebookCore = NotebookCore;