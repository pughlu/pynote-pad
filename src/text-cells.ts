class TextCellElement extends BaseNotebookCell {
    editorView!: any;
    editDiv!: HTMLDivElement;

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (name === 'content') {
            if ((this as any).yText) return; // Yjs drives this
            if (this.editorView && this.content !== this.editorView.state.doc.toString()) {
                this.editorView.dispatch({
                    changes: {from: 0, to: this.editorView.state.doc.length, insert: this.content}
                });
            }
        }
    }

    mountContent(container: HTMLElement) { 
        this.editDiv = document.createElement('div');
        this.editDiv.className = 'w-full flex-col flex';
        
        container.appendChild(this.editDiv);

        if (typeof window !== 'undefined' && (window as any).cm6) {
            const cm6 = (window as any).cm6;
            
            const customExtensions = [
                cm6.basicSetup,
                cm6.EditorView.lineWrapping,
                // Transparent theme
                cm6.EditorView.theme({
                    "&": { backgroundColor: "transparent" },
                    ".cm-scroller": { 
                        fontFamily: "'Fira Code', monospace", 
                        fontSize: "14px",
                        fontVariantLigatures: "none"
                    },
                    ".cm-content": { minHeight: "3.25rem", padding: "10px 16px 10px 16px", color: "#334155" },
                    "&.cm-focused": { outline: "none" },
                    ".cm-gutters": { display: "none" }
                }),
                // Shift+Enter keymap
                cm6.keymap.of([{
                    key: "Shift-Enter",
                    run: () => {
                        this.dispatchAction('cell-insert-below');
                        return true;
                    }
                }]),
                // Update listener for sync
                cm6.EditorView.updateListener.of((update: any) => {
                    if (update.docChanged) {
                        this.content = update.state.doc.toString();
                        if (!(this as any).yText) {
                            this.dispatchAction('cell-content-changed');
                        }
                    }
                }),
                // Focus listener to track active editor
                cm6.EditorView.domEventHandlers({
                    focus: () => {
                        if (window.notebookCore) window.notebookCore.activeCodeEditor = null;
                        return false;
                    }
                }),
                // ReadOnly support
                cm6.EditorState.readOnly.of(this.effectiveIsLocked || !this.effectiveIsEditable)
            ];

            if ((this as any).yText && (window as any).collabProvider) {
                customExtensions.push((window as any).collabProvider.createEditorBinding((this as any).yText));
            }

            const initialContent = (this as any).yText ? (this as any).yText.toString() : (this.content || '');
            const state = cm6.createEditorState(initialContent, { extensions: customExtensions });
            this.editorView = cm6.createEditorView(state, this.editDiv);
        }
    }

    refresh() { 
        this.dispatchAction('cell-height-changed');
    }
    
    focusCell() { 
        if (this.editorView && !this.effectiveIsLocked && this.effectiveIsEditable) {
            this.editorView.focus(); 
        }
    }

    toJSON() {
        const base: any = super.toJSON();
        base.content = this.content;
        return base;
    }
}
customElements.define('notebook-text-cell', TextCellElement);