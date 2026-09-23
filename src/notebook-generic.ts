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

let globalPyodideWorker: Worker | null = null;

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
            // 1. Re-use or Spawn the global background worker
            if (!globalPyodideWorker) {
                globalPyodideWorker = new Worker('pyodide-worker.js', { type: 'module' });
            }
            this.worker = globalPyodideWorker;

            // 2. Route all incoming worker messages to the CURRENT instance
            this.worker.onmessage = (e) => this.handleMessage(e.data);

            // 3. Send INIT. The worker latch ensures Pyodide is only loaded once.
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
        // We do NOT terminate the global worker. Just disconnect to let it survive tab switches.
        this.isReady = false;
        if (this.worker) {
            // Optional: we don't nullify onmessage because the new kernel instantly overwrites it
        }
    }

    interrupt() {
        if (this.worker) {
            this.worker.terminate();
            globalPyodideWorker = null;
            this.worker = null;
        }
        this.isReady = false;
        
        // Reject all pending callbacks with KeyboardInterrupt
        for (const id in this.callbacks) {
            this.callbacks[id].reject(new Error("KeyboardInterrupt: Kernel restarted..."));
        }
        this.callbacks = {};
        this.targetDivs = {};
        
        // Respawn the worker in the background
        if (this.statusCallback) {
            this.init(this.statusCallback);
        }
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
    currentInputReject!: any;
    inputCache!: string[];
    currentInputIndex!: number;

    constructor(options: any = {}) {
        this.isReady = false;
        this.currentOutputDiv = null;
        this.maxOutputChars = options.maxOutputChars || 50000;
        this.currentOutputCount = 0;
        this.isKilled = false;
        this.executionHistory = [];
        this.capturingOutput = true;
        this.currentInputReject = null;
        this.inputCache = [];
        this.currentInputIndex = 0;
    }

    restart() {
        this.executionHistory = [];
        this.inputCache = [];
        this.currentInputIndex = 0;
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
        this.currentInputIndex = 0;

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
            inputfun: (promptText) => this.showInputPrompt(promptText),
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
            console.debug("Skulpt Executable Script:\n", executableCode);
            await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, executableCode, true));
            if (code.trim()) {
                const indentedCode = code.split('\n').map(line => '    ' + line).join('\n');
                this.executionHistory.push(`try:\n${indentedCode}\n    pass\nexcept BaseException:\n    pass`);
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
                this.executionHistory.push(`try:\n${indentedCode}\n    pass\nexcept BaseException:\n    pass`);
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
        if (this.currentInputReject) {
            this.currentInputReject(new Error("KeyboardInterrupt"));
            this.currentInputReject = null;
        }
        this.isReady = false;
    }
    
    interrupt() {
        if (this.currentInputReject) {
            this.currentInputReject(new Error("KeyboardInterrupt: Kernel restarted..."));
            this.currentInputReject = null;
        }
        
        // Force Skulpt to timeout instantly if it's currently executing synchronously
        if (typeof (window as any).Sk !== 'undefined') {
            (window as any).Sk.execLimit = 1;
            setTimeout(() => { (window as any).Sk.execLimit = 5000; }, 50); // Reset after it trips
        }
    }

    showInputPrompt(promptText: string): Promise<string> {
        if (this.currentInputIndex < this.inputCache.length) {
            return Promise.resolve(this.inputCache[this.currentInputIndex++]);
        }

        return new Promise((resolve, reject) => {
            const waitStart = Date.now();
            if (!this.currentOutputDiv) {
                const res = prompt(promptText);
                const finalRes = res || '';
                this.inputCache.push(finalRes);
                this.currentInputIndex++;
                if (typeof (window as any).Sk !== 'undefined' && (window as any).Sk.execStart) {
                    (window as any).Sk.execStart = Date.now();
                }
                resolve(finalRes);
                return;
            }

            const promptSpan = document.createElement('span');
            promptSpan.className = 'text-slate-700';
            promptSpan.innerText = promptText;
            
            const inputField = document.createElement('input');
            inputField.type = 'text';
            inputField.className = 'bg-slate-100 border border-slate-300 outline-none font-mono text-sm py-0.5 px-1 rounded ml-1 min-w-[200px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all';
            
            const inputWrap = document.createElement('span');
            inputWrap.className = 'inline-flex items-center';
            inputWrap.appendChild(inputField);

            this.currentOutputDiv.appendChild(promptSpan);
            this.currentOutputDiv.appendChild(inputWrap);
            
            if (this.currentOutputDiv.parentElement) {
                this.currentOutputDiv.parentElement.scrollTop = this.currentOutputDiv.parentElement.scrollHeight;
            }

            inputField.focus();

            const handleSubmit = () => {
                cleanup();
                const finalRes = inputField.value;
                this.inputCache.push(finalRes);
                this.currentInputIndex++;
                
                inputWrap.remove();
                promptSpan.innerText = promptText + finalRes + '\n';
                
                if (typeof (window as any).Sk !== 'undefined' && (window as any).Sk.execStart) {
                    (window as any).Sk.execStart = Date.now();
                }
                
                resolve(finalRes);
            };

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                }
            };

            const cleanup = () => {
                inputField.removeEventListener('keydown', handleKeyDown);
                this.currentInputReject = null;
            };

            inputField.addEventListener('keydown', handleKeyDown);
            
            this.currentInputReject = () => {
                cleanup();
                inputWrap.remove();
                reject(new Error("Input cancelled"));
            };
        });
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
    isInit!: boolean;

    get effectiveIsLocked() { return (window as any).notebookCore?.options?.ignoreCellLocks ? false : this.isLocked; }
    get effectiveIsEditable() { return (window as any).notebookCore?.options?.ignoreCellLocks ? true : this.isEditable; }
    get effectiveIsDeletable() { return (window as any).notebookCore?.options?.ignoreCellLocks ? true : this.isDeletable; }
    get effectiveIsMoveable() { return (window as any).notebookCore?.options?.ignoreCellLocks ? true : this.isMoveable; }

    isHidden!: boolean;
    mainBox!: HTMLDivElement;
    contentArea!: HTMLDivElement;
    botInserter?: HTMLDivElement;
    deleteBtn?: HTMLButtonElement;

    metadata?: Record<string, any>;

    constructor() {
        super();
        this._initialized = false;
        this.actionBtnElement = null;
        this.resizeObserver = null;
        this.metadata = {};
        this.isLocked = false;
        this.isEditable = true;
        this.isDeletable = true;
        this.isMoveable = true;
        this.isInit = false;
        this.isHidden = false;
    }

    static get observedAttributes() {
        return ['is-locked', 'is-editable', 'is-deletable', 'is-moveable', 'is-hidden', 'is-init', 'cell-metadata', 'content'];
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue === newValue) return;

        if (name === 'is-locked') this.isLocked = newValue !== null;
        if (name === 'is-editable') this.isEditable = newValue !== 'false';
        if (name === 'is-deletable') this.isDeletable = newValue !== 'false';
        if (name === 'is-moveable') this.isMoveable = newValue !== 'false';
        if (name === 'is-hidden') this.isHidden = newValue !== null;
        if (name === 'is-init') this.isInit = newValue !== null;
        if (name === 'content') this.content = newValue || '';
        if (name === 'cell-metadata') {
            try { this.metadata = newValue ? JSON.parse(newValue) : {}; } catch {}
        }

        if (this._initialized) {
            this.updateView();
        }
    }

    dragHandle?: HTMLDivElement;
    toolbar?: HTMLDivElement;
    typeDropdown?: HTMLDivElement;
    typeSeparator?: HTMLDivElement;

    connectedCallback() {
        if (this._initialized) return;
        this._initialized = true;

        this.cellId = this.getAttribute('cell-id') || Math.random().toString(36).substring(2, 9);
        this.cellType = this.getAttribute('cell-type') || 'text';
        this.content = this.getAttribute('content') || '';
        this.isLocked = this.hasAttribute('is-locked');
        this.isHidden = this.hasAttribute('is-hidden');
        this.isEditable = this.getAttribute('is-editable') !== 'false';
        this.isDeletable = this.getAttribute('is-deletable') !== 'false';
        this.isMoveable = this.getAttribute('is-moveable') !== 'false';

        const metaAttr = this.getAttribute('cell-metadata');
        if (metaAttr) {
            try { this.metadata = JSON.parse(metaAttr); } catch {}
        }
        if (!this.metadata) this.metadata = {};

        this.renderShell();
        this.mountContent(this.contentArea);
        this.updateView();

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

    updateView() {
        const isReadOnlyGlobal = (window as any).notebookCore?.options?.isReadOnly;
        const disableMove = (window as any).notebookCore?.options?.disableMove;
        const disableDelete = (window as any).notebookCore?.options?.disableDelete;
        const disableTypeChange = (window as any).notebookCore?.options?.disableTypeChange;
        const disableInsert = (window as any).notebookCore?.options?.disableInsertAll;

        if (this.effectiveIsLocked || isReadOnlyGlobal) {
            this.mainBox.classList.add('bg-slate-50');
        } else {
            this.mainBox.classList.remove('bg-slate-50');
        }

        if (this.dragHandle) {
            this.dragHandle.style.display = (!this.effectiveIsLocked && this.effectiveIsMoveable && !isReadOnlyGlobal && !disableMove) ? 'block' : 'none';
        }

        if (this.toolbar) {
            const showToolbar = !this.effectiveIsLocked && !isReadOnlyGlobal;
            if (showToolbar) {
                let toolCount = 0;
                
                if (this.typeDropdown) {
                    if (!disableTypeChange) {
                        this.typeDropdown.style.display = 'flex';
                        toolCount++;
                    } else {
                        this.typeDropdown.style.display = 'none';
                    }
                }
                
                if (this.deleteBtn) {
                    if (!disableDelete && this.effectiveIsDeletable) {
                        this.deleteBtn.style.display = 'block';
                        toolCount++;
                    } else {
                        this.deleteBtn.style.display = 'none';
                    }
                }

                if (this.typeSeparator) {
                    this.typeSeparator.style.display = (!disableTypeChange && !disableDelete && this.effectiveIsDeletable) ? 'block' : 'none';
                }

                this.toolbar.style.display = toolCount > 0 ? 'flex' : 'none';
            } else {
                this.toolbar.style.display = 'none';
            }
        }
        
        if (this.botInserter) {
            this.botInserter.style.display = '';
        }

        if ((window as any).notebookCore) {
            (window as any).notebookCore.updateQuestionModeVisibility();
        }
    }

    renderShell() {
        this.className = 'cell-wrapper relative flex flex-col w-full my-1.5 group/wrapper block box-border';

        this.mainBox = document.createElement('div');
        this.mainBox.className = 'cell-container group/cell relative bg-white border border-slate-200 rounded-md shadow-sm flex items-stretch transition-all hover:border-slate-300 min-h-[1.75rem] box-border';

        this.dragHandle = document.createElement('div');
        this.dragHandle.className = 'drag-handle absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-blue-600 group-hover/cell:bg-blue-400 cursor-grab z-30 rounded-l-md opacity-0 group-hover/cell:opacity-100 transition-all';
        this.mainBox.appendChild(this.dragHandle);

        this.contentArea = document.createElement('div');
        this.contentArea.className = 'flex-1 relative flex flex-col min-w-0 p-0 box-border min-h-0';

        this.toolbar = document.createElement('div');
        this.toolbar.className = 'cell-toolbar absolute z-40 flex items-center gap-1 bg-white/95 backdrop-blur-sm shadow-sm border border-slate-200 rounded-md px-1.5 py-0.5 opacity-0 group-hover/cell:opacity-100 transition-all text-xs';

        this.typeDropdown = document.createElement('div');
        this.typeDropdown.className = 'relative flex items-center justify-center rounded hover:bg-slate-100 transition-colors text-slate-500 font-medium px-1 cursor-pointer';
        this.typeDropdown.innerHTML = `
            <span>${this.cellType}</span>
            <svg class="w-3 h-3 ml-0.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            <select class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Change Cell Type">
                <option value="code" ${this.cellType === 'code' ? 'selected' : ''}>code</option>
                <option value="markdown" ${this.cellType === 'markdown' ? 'selected' : ''}>markdown</option>
                <option value="text" ${this.cellType === 'text' ? 'selected' : ''}>text</option>
            </select>
        `;
        (this.typeDropdown.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
            this.dispatchAction('cell-type-changed', { newType: (e.target as any).value, content: this.content });
        });
        
        this.deleteBtn = document.createElement('button');
        this.deleteBtn.className = 'delete-btn text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors ml-0.5 pl-1 border-l border-slate-200';
        this.deleteBtn.title = 'delete cell';
        this.deleteBtn.innerHTML = `<svg class="w-3 h-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
        this.deleteBtn.onclick = (e) => {
            if (this.deleteBtn!.classList.contains('cursor-not-allowed')) {
                e.stopPropagation(); return;
            }
            this.dispatchAction('cell-deleted');
        };

        this.typeSeparator = document.createElement('div');
        this.typeSeparator.className = 'w-px h-3 bg-slate-200 mx-0.5';

        this.toolbar.appendChild(this.typeDropdown);
        this.toolbar.appendChild(this.typeSeparator);
        this.toolbar.appendChild(this.deleteBtn);
        this.contentArea.appendChild(this.toolbar);

        this.actionBtnElement = document.createElement('button');
        this.actionBtnElement.className = 'cell-action-btn absolute z-30 flex items-center justify-center w-7 h-7 text-white bg-blue-500 hover:bg-blue-600 rounded-full shadow-md transition-all opacity-0 hidden group-hover/cell:opacity-100';
        this.actionBtnElement.onclick = () => this.handleActionClick();
        this.contentArea.appendChild(this.actionBtnElement);

        this.mainBox.appendChild(this.contentArea);
        this.appendChild(this.mainBox);

        this.botInserter = document.createElement('div');
        this.botInserter.className = 'bot-inserter absolute left-0 right-0 h-3 group-hover/inserter:h-6 transition-all duration-300 delay-0 group-hover/inserter:delay-250 flex items-center justify-center group/inserter cursor-pointer z-50 w-4/5 mx-auto';
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
            isMoveable: this.isMoveable,
            metadata: this.metadata || {}
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
    collabDoc!: any; // ICollaborativeDocument
    collabArray!: any; // ICollaborativeArray
    private _isExecuting: boolean = false;
    
    get isExecuting(): boolean { return this._isExecuting; }
    set isExecuting(val: boolean) {
        this._isExecuting = val;
        
        const btnRunAll = document.getElementById('run-all-btn');
        const ideBtnRunAll = document.getElementById('btn-run-all');
        const playIcon = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>`;
        const stopIcon = `<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

        if (val) {
            document.body.setAttribute('data-kernel-executing', 'true');
            if (btnRunAll) {
                btnRunAll.innerHTML = `${stopIcon} Stop All`;
                btnRunAll.classList.add('is-executing');
            }
            if (ideBtnRunAll) {
                ideBtnRunAll.innerHTML = `${stopIcon} Stop All`;
                ideBtnRunAll.classList.add('is-executing');
            }
        } else {
            document.body.removeAttribute('data-kernel-executing');
            if (btnRunAll) {
                btnRunAll.innerHTML = `${playIcon} Run All`;
                btnRunAll.classList.remove('is-executing');
            }
            if (ideBtnRunAll) {
                ideBtnRunAll.innerHTML = `${playIcon} Run All`;
                ideBtnRunAll.classList.remove('is-executing');
            }
        }
    }

    constructor(containerId: string, options: any = {}) {
        this.container = document.getElementById(containerId);
        this._isExecuting = false;

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
            defaultConfig.disableMove = false;
            defaultConfig.disableDelete = false;
            defaultConfig.disableTypeChange = true;
            defaultConfig.disableInsertAll = false;
            defaultConfig.disableInsertTop = false;
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
            topInserter.onclick = () => this.addCell(this.defaultCellType, 0);
        }
        
        this.applyGlobalState();

        const ui = document.getElementById('pynote-kernel-ui') as any;
        if (ui) {
            ui.kernel = this.options.kernelType;
            ui.disabled = !!this.options.lockKernel;
            ui.addEventListener('kernel-change', (e: any) => this.switchKernel(e.detail.kernel));
            ui.addEventListener('kernel-restart', () => this.restartKernel());
        }

        this.initKernel();
        this.setupEventListeners();

        document.fonts.ready.then(() => {
            Array.from(this.container.children).forEach(cell => { if ((cell as any).refresh) (cell as any).refresh(); });
            if (typeof sendHeight === 'function') sendHeight();
        });
        
        this.updateQuestionModeVisibility();
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
            if (!this.isReadOnly && el && !el.effectiveIsLocked && el.effectiveIsDeletable) {
                if (this.options.questionMode && el.cellType === 'code') {
                    const prev = el.previousElementSibling;
                    const next = el.nextElementSibling;
                    const prevIsCode = prev && prev.cellType === 'code' && !prev.effectiveIsLocked && prev.effectiveIsEditable !== false;
                    const nextIsCode = next && next.cellType === 'code' && !next.effectiveIsLocked && next.effectiveIsEditable !== false;
                    
                    if (!prevIsCode && !nextIsCode) {
                        alert("Cannot delete this code cell: at least one adjacent code cell is required in Question Mode.");
                        return;
                    }
                    if (!confirm("Are you sure you want to delete this cell?")) return;
                } else if (this.options.questionMode) {
                    if (!confirm("Are you sure you want to delete this cell?")) return;
                }

                if (this.collabArray) {
                    const idx = Array.from(this.container.children).indexOf(el);
                    if (idx > -1) {
                        this.collabDoc.transact(() => {
                            this.collabArray.delete(idx, 1);
                        });
                    }
                } else {
                    el.remove();
                    this.syncToServer();
                }
                this.updateQuestionModeVisibility();
            }
        });

        this.container.addEventListener('cell-insert-below', (e) => {
            if (this.isReadOnly || this.options.disableInsertAll) return;
            const el = (e.target as any);
            const idx = Array.from(this.container.children).indexOf(el);
            
            if (this.collabArray) {
                this.addCell('code', idx + 1);
            } else {
                const newCell = this.createCellElement({ type: 'code', content: '' });
                el.insertAdjacentElement('afterend', newCell);
                this.syncToServer();
                this.updateQuestionModeVisibility();
                setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 50);
            }
        });

        this.container.addEventListener('cell-type-changed', (e) => {
            if (this.isReadOnly) return;
            const oldEl = (e.target as any);
            if (oldEl.effectiveIsLocked || !oldEl.effectiveIsMoveable) return;

            const newType = ((e as any).detail as any).newType;
            const content = ((e as any).detail as any).content;
            
            if (this.collabArray) {
                const idx = Array.from(this.container.children).indexOf(oldEl);
                if (idx > -1) {
                    this.collabDoc.transact(() => {
                        const collabProvider = (window as any).collabProvider;
                        if (!collabProvider) return;
                        const yMap = collabProvider.createMap();
                        yMap.set('type', newType);
                        yMap.set('content', collabProvider.createText(content));
                        yMap.set('isEditing', newType === 'markdown');
                        this.collabArray.delete(idx, 1);
                        this.collabArray.insert(idx, [yMap]);
                    });
                }
            } else {
                const newCell = this.createCellElement({ type: newType, content: content, isEditing: newType === 'markdown' });
                this.container.insertBefore(newCell, oldEl);
                oldEl.remove();
                this.syncToServer();
                this.updateQuestionModeVisibility();
                setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 50);
            }
        });
    }

    updateKernelStatus(status) {
        const ui = document.getElementById('pynote-kernel-ui') as any;
        if (ui && typeof ui.setStatus === 'function') {
            ui.setStatus(status);
        }

        // Ensure buttons sync up their run state
        const cells = Array.from(this.container.children).filter(c => c.tagName.toLowerCase() === 'notebook-code-cell');
        cells.forEach(c => {
            if (!(c as any).isExecuting && typeof (c as any).setButtonState === 'function') {
                (c as any).setButtonState('default');
            }
        });

        if (status === 'ready') {
            window.dispatchEvent(new CustomEvent('kernel-status-changed', { detail: { isReady: true } }));
            this.runInitCells();
        }
    }

    async runInitCells() {
        const initCells = Array.from(this.container.children).filter(cell => 
            cell.tagName.toLowerCase() === 'notebook-code-cell' && (cell as any).isInit
        );
        for (let cell of initCells) {
            try {
                if (typeof (cell as any).handleActionClick === 'function') {
                    await (cell as any).handleActionClick();
                }
            } catch (err) {
                console.error("Init cell failed:", err);
            }
        }
    }

    async restartKernel() {
        if (this.isReadOnly) return;
        this.updateKernelStatus('loading');
        
        // Unlock any stuck execution states
        this.isExecuting = false;

        Array.from(this.container.children).forEach(cell => {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell' && (cell as any).clearOutput) {
                (cell as any).isExecuting = false;
                (cell as any).clearOutput();
                (cell as any).updateKernelUIState(false);
                if (typeof (cell as any).setButtonState === 'function') {
                    (cell as any).setButtonState('default');
                }
                const btn = cell.querySelector('.cell-action-btn');
                if (btn) btn.classList.remove('is-running');
            }
        });

        if (this.kernel && typeof this.kernel.destroy === 'function') {
            this.kernel.destroy();
        }

        // Re-initialize using the currently selected type
        setTimeout(() => {
            this.initKernel();
        }, 700);
    }
    
    async interrupt() {
        if (this.isReadOnly) return;
        
        // Unlock global execution state
        this.isExecuting = false;

        // Reset all cell execution states
        Array.from(this.container.children).forEach(cell => {
            if (cell.tagName.toLowerCase() === 'notebook-code-cell') {
                (cell as any).isExecuting = false;
                if (typeof (cell as any).setButtonState === 'function') {
                    (cell as any).setButtonState('default');
                }
                const btn = cell.querySelector('.cell-action-btn');
                if (btn) btn.classList.remove('is-running');
            }
        });
        
        // Call kernel interrupt
        if (this.kernel && typeof this.kernel.interrupt === 'function') {
            this.kernel.interrupt();
        }
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

    loadCollabDoc(collabDoc: any) {
        this.collabDoc = collabDoc;
        this.collabArray = collabDoc.getArray('cells');
        this.container.innerHTML = '';
        
        // Initial render
        const frag = document.createDocumentFragment();
        this.collabArray.forEach((yMap: any) => {
            frag.appendChild(this.createCellFromCollabMap(yMap));
        });
        this.container.appendChild(frag);

        this.collabArray.getRaw().observe((event: any) => {
            let index = 0;
            event.changes.delta.forEach((change: any) => {
                if (change.retain) {
                    index += change.retain;
                } else if (change.insert) {
                    change.insert.forEach((yMap: any, i: number) => {
                        const adapterMap = this.collabArray.get(index + i);
                        const newCell = this.createCellFromCollabMap(adapterMap);
                        if (this.container.children.length === 0 || (index + i) >= this.container.children.length) {
                            this.container.appendChild(newCell);
                        } else {
                            this.container.insertBefore(newCell, this.container.children[index + i]);
                        }
                    });
                    index += change.insert.length;
                } else if (change.delete) {
                    for (let i = 0; i < change.delete; i++) {
                        const cellToRemove = this.container.children[index];
                        if (cellToRemove) cellToRemove.remove();
                    }
                }
            });
            this.updateQuestionModeVisibility();
        });

        this.applyMaxWidth();
        setTimeout(() => this.setupDragAndDrop(), 0);
        this.updateQuestionModeVisibility();
    }

    createCellFromCollabMap(yMap: any) {
        let tagName = 'notebook-text-cell';
        const type = yMap.get('type') || 'text';
        if (type === 'markdown') tagName = 'notebook-markdown-cell';
        if (type === 'code') tagName = 'notebook-code-cell';

        const cell = document.createElement(tagName) as any;
        cell.yMap = yMap;
        cell.yText = yMap.get('content');
        cell.content = cell.yText ? cell.yText.toString() : '';
        
        cell.setAttribute('cell-id', Math.random().toString(36).substring(2, 9));
        cell.setAttribute('cell-type', type);
        
        if (yMap.get('isLocked')) cell.setAttribute('is-locked', '');
        if (yMap.get('isHidden')) cell.setAttribute('is-hidden', '');
        if (yMap.get('isEditable') === false) cell.setAttribute('is-editable', 'false');
        if (yMap.get('isDeletable') === false) cell.setAttribute('is-deletable', 'false');
        if (yMap.get('isMoveable') === false) cell.setAttribute('is-moveable', 'false');
        if (yMap.get('isInit')) cell.setAttribute('is-init', '');

        const meta: any = {};
        const reservedKeys = ['content', 'type', 'isLocked', 'isHidden', 'isEditable', 'isDeletable', 'isMoveable', 'isInit', 'isEditing', 'metadata'];
        for (const [key, value] of yMap.entries()) {
            if (!reservedKeys.includes(key)) {
                meta[key] = value;
            }
        }
        if (Object.keys(meta).length > 0) {
            cell.setAttribute('cell-metadata', JSON.stringify(meta));
            cell.metadata = meta;
        }

        return cell;
    }

    loadData(cellDataArray: any) {
        // Legacy loader for standard flatfiles without Yjs
        this.container.innerHTML = '';

        if (cellDataArray.globalConfig) {
            this.options = { ...cellDataArray.globalConfig, ...this.options };
        }

        cellDataArray.forEach(data => {
            this.container.appendChild(this.createCellElement(data));
        });
        
        this.applyMaxWidth();
        this.setupDragAndDrop();
        this.updateQuestionModeVisibility();
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
        if (data.isInit) cell.setAttribute('is-init', '');
        
        if (data.metadata) {
            cell.setAttribute('cell-metadata', JSON.stringify(data.metadata));
            (cell as any).metadata = data.metadata;
        }
        return cell;
    }

    addCell(type = 'code', index = 0, preventFocus = false) {
        if (this.isReadOnly || this.options.disableInsertAll) return;
        if (this.collabArray) {
            const collabProvider = (window as any).collabProvider;
            if (!collabProvider) return;
            const yMap = collabProvider.createMap();
            yMap.set('type', type);
            yMap.set('content', collabProvider.createText(''));
            yMap.set('isEditing', type === 'markdown');
            
            this.collabDoc.transact(() => {
                const insertIndex = index !== undefined && index >= 0 ? index : this.collabArray.length;
                this.collabArray.insert(insertIndex, [yMap]);
            });
            
            if (!preventFocus) {
                setTimeout(() => {
                    const insertIndex = index !== undefined && index >= 0 ? index : this.collabArray.length - 1;
                    const cell = this.container.children[insertIndex];
                    if (cell && (cell as any).focusCell) (cell as any).focusCell();
                }, 50);
            }
            return;
        }

        // Legacy DOM flow
        const data = { type, content: '', isEditing: type === 'markdown' };
        const newCell = this.createCellElement(data);

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

    applyGlobalState() {
        if (this.container && this.container.parentElement) {
            const disableAll = this.options.disableInsertAll || this.isReadOnly;
            const disableTop = disableAll || this.options.disableInsertTop;
            this.container.parentElement.setAttribute('data-disable-insert-all', disableAll ? 'true' : 'false');
            this.container.parentElement.setAttribute('data-disable-insert-top', disableTop ? 'true' : 'false');
        }
    }

    updateQuestionModeVisibility() {
        this.applyGlobalState();
        if (!this.options.questionMode) return;
        const children = Array.from(this.container.children) as any[];
        
        for (let i = 0; i < children.length; i++) {
            const cell = children[i];
            const isCode = cell.cellType === 'code' && !cell.effectiveIsLocked && cell.effectiveIsEditable !== false;
            const next = children[i+1];
            const nextIsCode = next && next.cellType === 'code' && !next.effectiveIsLocked && next.effectiveIsEditable !== false;
            
            if (cell.botInserter) {
                if (isCode || nextIsCode) {
                    cell.botInserter.classList.remove('hidden-by-qm');
                } else {
                    cell.botInserter.classList.add('hidden-by-qm');
                }
            }

        }
    }

    setupDragAndDrop() {
        // --- UPDATED: Prevent SortableJS from running if disableMove is active ---
        if (this.isReadOnly || this.options.disableMove || this.sortable || typeof Sortable === 'undefined') return;

        this.sortable = new Sortable(this.container, {
            handle: '.drag-handle',
            animation: 150,
            filter: '[is-locked], [is-moveable="false"]',
            onMove: (evt: any) => {
                const dragged = evt.dragged;
                if (dragged && (dragged.effectiveIsLocked || dragged.effectiveIsMoveable === false)) {
                    return false;
                }
                if (this.options.questionMode) {
                    const related = evt.related;
                    if (!dragged || !related) return false;
                    
                    const draggedIsCode = dragged.cellType === 'code' && !dragged.effectiveIsLocked && dragged.effectiveIsEditable !== false;
                    const relatedIsCode = related.cellType === 'code' && !related.effectiveIsLocked && related.effectiveIsEditable !== false;
                    
                    if (draggedIsCode && relatedIsCode) return true;
                    return false;
                }
                return true;
            },
            onEnd: (evt: any) => {
                const newIndex = evt.newIndex;
                const oldIndex = evt.oldIndex;
                
                if (this.collabArray && newIndex !== undefined && oldIndex !== undefined && newIndex !== oldIndex) {
                    this.collabDoc.transact(() => {
                        const item = this.collabArray.get(oldIndex);
                        this.collabArray.delete(oldIndex, 1);
                        this.collabArray.insert(newIndex, [item]);
                    });
                } else {
                    const cells = Array.from(this.container.children);
                    cells.forEach(cell => { if ((cell as any).refresh) (cell as any).refresh(); });
                    this.syncToServer();
                }
                this.updateQuestionModeVisibility();
            },
        });
    }

    getSelectedCell(): { index: number, el: any } | null {
        if (!this.selectedIndices || this.selectedIndices.length === 0) return null;
        const index = this.selectedIndices[0];
        const children = this.container.children;
        if (index >= 0 && index < children.length) {
            return { index, el: children[index] };
        }
        return null;
    }

    splitCellAtCursor() {
        if (this.isReadOnly || this.options.disableInsertAll) return;
        const selected = this.getSelectedCell();
        if (!selected) return;

        const { index, el } = selected;
        if (el.isLocked || el.isEditable === false) return;

        let content = '';
        let cursorStart = -1;

        if (el.tagName.toLowerCase() === 'notebook-code-cell' && el.editorView) {
            content = el.editorView.state.doc.toString();
            cursorStart = el.editorView.state.selection.main.head;
        } else if (el.tagName.toLowerCase() === 'notebook-markdown-cell' && el.textarea) {
            content = el.textarea.value;
            cursorStart = el.textarea.selectionStart;
        } else {
            content = el.content || '';
            cursorStart = Math.floor(content.length / 2); // fallback: split in half
        }

        if (cursorStart >= 0 && cursorStart < content.length) {
            const firstHalf = content.substring(0, cursorStart);
            const secondHalf = content.substring(cursorStart);

            if (this.collabArray) {
                const idx = Array.from(this.container.children).indexOf(el);
                if (idx > -1) {
                    this.collabDoc.transact(() => {
                        const collabProvider = (window as any).collabProvider;
                        
                        // Mutate current text
                        const collabText = (el as any).yText;
                        if (collabText) {
                            const rawText = collabText.getRaw();
                            if (rawText.delete) {
                                rawText.delete(cursorStart, content.length - cursorStart);
                            }
                        }

                        // Create new cell map
                        const yMap = collabProvider.createMap();
                        yMap.set('type', el.cellType);
                        yMap.set('content', collabProvider.createText(secondHalf));
                        yMap.set('isEditing', el.cellType === 'markdown');
                        
                        this.collabArray.insert(idx + 1, [yMap]);
                    });
                }
            } else {
                // Update current cell
                if (el.tagName.toLowerCase() === 'notebook-code-cell' && el.editorView) {
                    el.editorView.dispatch({ changes: { from: 0, to: content.length, insert: firstHalf } });
                } else {
                    el.content = firstHalf;
                    if (el.textarea) el.textarea.value = firstHalf;
                    if (el.markdownContent && typeof (window as any).marked !== 'undefined') {
                        el.markdownContent.innerHTML = (window as any).marked.parse(firstHalf);
                    }
                }

                // Create new cell
                const newCell = this.createCellElement({ type: el.cellType, content: secondHalf, isEditing: el.cellType === 'markdown' });
                this.container.insertBefore(newCell, el.nextSibling);
                this.syncToServer();
                setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 100);
            }
        }
    }

    mergeWithCellBelow() {
        if (this.isReadOnly || this.options.disableDelete) return;
        const selected = this.getSelectedCell();
        if (!selected) return;

        const { index, el } = selected;
        if (el.effectiveIsLocked || el.effectiveIsEditable === false) return;

        const nextEl = el.nextElementSibling as any;
        if (!nextEl || nextEl.effectiveIsLocked || nextEl.effectiveIsDeletable === false) return;

        // Get current and next contents
        let currentContent = '';
        if (el.tagName.toLowerCase() === 'notebook-code-cell' && el.editorView) {
            currentContent = el.editorView.state.doc.toString();
        } else {
            currentContent = el.content || '';
        }

        let nextContent = '';
        if (nextEl.tagName.toLowerCase() === 'notebook-code-cell' && nextEl.editorView) {
            nextContent = nextEl.editorView.state.doc.toString();
        } else {
            nextContent = nextEl.content || '';
        }

        const mergedContent = currentContent + '\n' + nextContent;

        if (this.collabArray) {
            this.collabDoc.transact(() => {
                const collabText = (el as any).yText;
                if (collabText) {
                    const rawText = collabText.getRaw();
                    if (rawText.insert) {
                        rawText.insert(currentContent.length, '\n' + nextContent);
                    }
                }
                this.collabArray.delete(index + 1, 1);
            });
        } else {
            // Update current cell
            if (el.tagName.toLowerCase() === 'notebook-code-cell' && el.editorView) {
                el.editorView.dispatch({ changes: { from: 0, to: currentContent.length, insert: mergedContent } });
            } else {
                el.content = mergedContent;
                if (el.textarea) el.textarea.value = mergedContent;
                if (el.markdownContent && typeof (window as any).marked !== 'undefined') {
                    el.markdownContent.innerHTML = (window as any).marked.parse(mergedContent);
                }
            }

            nextEl.remove();
            this.syncToServer();
        }
    }

    duplicateCell() {
        if (this.isReadOnly || this.options.disableInsertAll) return;
        const selected = this.getSelectedCell();
        if (!selected) return;

        const { el } = selected;
        const data = el.toJSON();
        data.id = Math.random().toString(36).substring(2, 9); // new ID
        
        // Ensure content is fresh
        if (el.tagName.toLowerCase() === 'notebook-code-cell' && el.editorView) {
            data.content = el.editorView.state.doc.toString();
        }

        if (this.collabArray) {
            const idx = Array.from(this.container.children).indexOf(el);
            if (idx > -1) {
                this.collabDoc.transact(() => {
                    const collabProvider = (window as any).collabProvider;
                    const yMap = collabProvider.createMap();
                    for (const [key, val] of Object.entries(data)) {
                        if (key === 'content') {
                            yMap.set('content', collabProvider.createText(val as string));
                        } else {
                            yMap.set(key, val);
                        }
                    }
                    this.collabArray.insert(idx + 1, [yMap]);
                });
            }
        } else {
            const newCell = this.createCellElement(data);
            this.container.insertBefore(newCell, el.nextSibling);
            this.syncToServer();
            setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 100);
        }
    }

    deleteSelectedCell() {
        if (this.options.disableDelete) return;
        const selected = this.getSelectedCell();
        if (!selected) return;

        const { index, el } = selected;
        if (!this.isReadOnly && !el.effectiveIsLocked && el.effectiveIsDeletable !== false) {
            if (this.collabArray) {
                const idx = Array.from(this.container.children).indexOf(el);
                if (idx > -1) {
                    this.collabDoc.transact(() => {
                        this.collabArray.delete(idx, 1);
                    });
                }
            } else {
                el.remove();
                this.syncToServer();
            }
            this.selectedIndices = [];
        }
    }

    copySelectedCell() {
        const selected = this.getSelectedCell();
        if (!selected) return;
        const data = selected.el.toJSON();
        
        // Ensure content is fresh
        if (selected.el.tagName.toLowerCase() === 'notebook-code-cell' && selected.el.editorView) {
            data.content = selected.el.editorView.state.doc.toString();
        }
        
        window.sessionStorage.setItem('pynote_copied_cell', JSON.stringify(data));
    }

    pasteCell() {
        if (this.isReadOnly || this.options.disableInsertAll) return;
        const copiedData = window.sessionStorage.getItem('pynote_copied_cell');
        if (!copiedData) return;

        try {
            const data = JSON.parse(copiedData);
            data.id = Math.random().toString(36).substring(2, 9); // Assign new ID
            
            const selected = this.getSelectedCell();
            
            if (this.collabArray) {
                const collabProvider = (window as any).collabProvider;
                const yMap = collabProvider.createMap();
                for (const [key, val] of Object.entries(data)) {
                    if (key === 'content') {
                        yMap.set('content', collabProvider.createText(val as string));
                    } else {
                        yMap.set(key, val);
                    }
                }
                
                this.collabDoc.transact(() => {
                    if (selected) {
                        const idx = Array.from(this.container.children).indexOf(selected.el);
                        this.collabArray.insert(idx + 1, [yMap]);
                    } else {
                        this.collabArray.push([yMap]);
                    }
                });
            } else {
                const newCell = this.createCellElement(data);
                if (selected) {
                    this.container.insertBefore(newCell, selected.el.nextSibling);
                } else {
                    this.container.appendChild(newCell);
                }
                this.syncToServer();
                setTimeout(() => { if ((newCell as any).focusCell) (newCell as any).focusCell(); }, 100);
            }
        } catch (e) {
            console.error("Paste Error:", e);
        }
    }

    serializeToFlat() {
        const cells: any = this.toJSON();
        // Export the active configuration so the resulting flatfile is self-contained
        const cleanConfig: any = { ...this.options };
        delete cleanConfig.ignoreCellLocks;
        delete cleanConfig.widgetId;
        cells.globalConfig = cleanConfig;
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