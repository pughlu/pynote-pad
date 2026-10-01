export class PyNoteTopbar extends HTMLElement {
    private btnRunAll!: HTMLButtonElement;
    private kernelUI!: any; // pynote-kernel-ui

    constructor() {
        super();
        this.innerHTML = `
            <div class="notebook-topbar flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50/50 rounded-t-lg mb-2">
                <button class="btn-run-all flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold transition-colors shadow-sm" title="Run all cells in sequence">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>Run All</span>
                </button>
                <pynote-kernel-ui id="topbar-kernel-ui"></pynote-kernel-ui>
            </div>
        `;

        this.btnRunAll = this.querySelector('.btn-run-all')!;
        this.kernelUI = this.querySelector('#topbar-kernel-ui')!;

        this.btnRunAll.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('action-run-all', { bubbles: true }));
        });
    }

    public setExecuting(isExecuting: boolean) {
        if (isExecuting) {
            this.btnRunAll.innerHTML = `
                <svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                <span>Interrupt</span>
            `;
            this.btnRunAll.classList.replace('bg-blue-600', 'bg-slate-200');
            this.btnRunAll.classList.replace('hover:bg-blue-700', 'hover:bg-slate-300');
            this.btnRunAll.classList.replace('text-white', 'text-slate-800');
        } else {
            this.btnRunAll.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Run All</span>
            `;
            this.btnRunAll.classList.replace('bg-slate-200', 'bg-blue-600');
            this.btnRunAll.classList.replace('hover:bg-slate-300', 'hover:bg-blue-700');
            this.btnRunAll.classList.replace('text-slate-800', 'text-white');
        }
    }

    public get kernelUi() {
        return this.kernelUI;
    }
}

customElements.define('pynote-topbar', PyNoteTopbar);
