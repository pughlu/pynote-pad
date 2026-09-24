export class PyNoteKernelUI extends HTMLElement {
    private statusIndicator!: HTMLElement;
    private restartIcon!: SVGElement;
    private kernelSelector!: HTMLSelectElement;
    private restartBtn!: HTMLButtonElement;

    constructor() {
        super();
        this.innerHTML = `
            <div class="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md tracking-wider border border-slate-200 shadow-inner">
                <div class="kernel-status-indicator flex items-center gap-1.5 uppercase min-w-[70px]">
                    <span class="h-2 w-2 rounded-full bg-orange-500 inline-block animate-pulse"></span> Starting...
                </div>
                <div class="w-px h-3 bg-slate-300 mx-0.5"></div>
                <select class="kernel-selector bg-transparent border-none outline-none cursor-pointer font-bold text-slate-600 hover:text-slate-900 uppercase text-[10px] text-center appearance-none px-1">
                    <option value="pyodide">Python (Pyodide)</option>
                    <option value="skulpt">Python (Skulpt)</option>
                </select>
                <button class="btn-restart-kernel hover:text-slate-900 transition-colors ml-1 flex items-center gap-1" title="Click to re-initialise the Python environment">
                    <svg class="icon-restart-kernel w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    <span>RESET</span>
                </button>
            </div>
        `;
        
        this.statusIndicator = this.querySelector('.kernel-status-indicator')!;
        this.restartIcon = this.querySelector('.icon-restart-kernel')!;
        this.kernelSelector = this.querySelector('.kernel-selector')!;
        this.restartBtn = this.querySelector('.btn-restart-kernel')!;

        this.kernelSelector.addEventListener('change', (e) => {
            this.dispatchEvent(new CustomEvent('kernel-change', {
                detail: { kernel: (e.target as HTMLSelectElement).value },
                bubbles: true
            }));
        });

        this.restartBtn.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('kernel-restart', { bubbles: true }));
        });
    }

    public setStatus(status: string) {
        if (status === 'loading') {
            this.statusIndicator.innerHTML = `<span class="h-2 w-2 rounded-full bg-orange-500 inline-block animate-pulse"></span> Starting...`;
            this.restartIcon.classList.add('animate-spin');
        } else if (status === 'packages') {
            this.statusIndicator.innerHTML = `<span class="h-2 w-2 rounded-full bg-blue-500 inline-block animate-pulse"></span> Loading Packages...`;
            this.restartIcon.classList.add('animate-spin');
        } else if (status === 'running') {
            this.statusIndicator.innerHTML = `<span class="braille-spinner mr-0.5 text-blue-600 font-bold"></span><span class="text-blue-600 font-bold">RUNNING</span>`;
            this.restartIcon.classList.remove('animate-spin');
        } else if (status === 'ready') {
            this.statusIndicator.innerHTML = `<span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span> Ready`;
            this.restartIcon.classList.remove('animate-spin');
        } else {
            this.statusIndicator.innerHTML = `<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span> Error`;
            this.restartIcon.classList.remove('animate-spin');
        }
    }

    public set disabled(val: boolean) {
        this.kernelSelector.disabled = val;
        if (val) this.kernelSelector.classList.add('opacity-50', 'cursor-not-allowed');
        else this.kernelSelector.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    public set kernel(val: string) {
        this.kernelSelector.value = val;
    }
}

customElements.define('pynote-kernel-ui', PyNoteKernelUI);
