class MarkdownCellElement extends BaseNotebookCell {
    isEditing!: boolean;
    viewDiv!: HTMLDivElement;
    editDiv!: HTMLDivElement;
    editorView!: any;

    connectedCallback() {
        this.isEditing = this.hasAttribute('is-editing');
        super.connectedCallback();
    }

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (name === 'content') {
            if ((this as any).yText) return; // Yjs drives this
            if (this.editorView && this.content !== this.editorView.state.doc.toString()) {
                this.editorView.dispatch({
                    changes: {from: 0, to: this.editorView.state.doc.length, insert: this.content}
                });
            }
            if (!this.isEditing && this.viewDiv) {
                this.renderMarkdown();
            }
        }
        if (name === 'is-editing') {
            this.isEditing = this.hasAttribute('is-editing');
            this.toggleMode();
        }
    }

    updateView() {
        super.updateView();
        if (this.effectiveIsLocked || !this.effectiveIsEditable) {
            if (this.isEditing) {
                this.isEditing = false;
                this.toggleMode();
                this.renderMarkdown();
            }
        }
        this.updateActionButton(this.getActionButtonConfig());
    }

    mountContent(container) {
        if (this.effectiveIsLocked || !this.effectiveIsEditable) this.isEditing = false;

        this.viewDiv = document.createElement('div');
        this.viewDiv.className = `markdown-body cursor-pointer min-h-[1.75rem] flex-1 ${this.isEditing ? 'hidden' : ''}`;

        this.viewDiv.addEventListener('dblclick', () => {
            if (this.effectiveIsLocked || !this.effectiveIsEditable) return;
            this.isEditing = true;
            this.toggleMode();
        });
        
        this.editDiv = document.createElement('div');
        this.editDiv.className = `w-full flex-col ${this.isEditing ? 'flex' : 'hidden'}`;
        
        container.appendChild(this.viewDiv);
        container.appendChild(this.editDiv);

        if (typeof window !== 'undefined' && (window as any).cm6) {
            const cm6 = (window as any).cm6;
            
            const customExtensions = [
                cm6.basicSetup,
                cm6.markdown(),
                cm6.EditorView.lineWrapping,
                // Transparent theme
                cm6.EditorView.theme({
                    "&": { backgroundColor: "transparent" },
                    ".cm-scroller": { fontFamily: "'Fira Code', monospace", fontSize: "14px" },
                    ".cm-content": { minHeight: "3.25rem", padding: "10px 16px 10px 16px", color: "#334155" },
                    "&.cm-focused": { outline: "none" },
                    ".cm-gutters": { display: "none" }
                }),
                // Shift+Enter keymap
                cm6.keymap.of([{
                    key: "Shift-Enter",
                    run: () => {
                        this.handleActionClick();
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
                })
            ];

            if ((this as any).yText && (window as any).collabProvider) {
                customExtensions.push((window as any).collabProvider.createEditorBinding((this as any).yText));
            }

            const initialContent = (this as any).yText ? (this as any).yText.toString() : (this.content || '');
            const state = cm6.createEditorState(initialContent, { extensions: customExtensions });
            this.editorView = cm6.createEditorView(state, this.editDiv);
        }
        
        this.renderMarkdown();
        this.updateActionButton(this.getActionButtonConfig());

        setTimeout(() => { 
            if (this.isEditing && !this.effectiveIsLocked && this.effectiveIsEditable && this.editorView) {
                this.editorView.focus(); 
            }
        }, 0);
    }

    // THE VANILLA RENDERER
    renderMarkdown() {
        try {
            this.viewDiv.innerHTML = (typeof marked !== 'undefined') 
                ? marked.parse(this.content || '*Empty Markdown cell*') 
                : (this.content || '');
        } catch (err) {
            console.warn("Markdown parse error:", err);
            this.viewDiv.innerText = this.content || '';
        }

        if (window.MathJaxHelper) {
            window.MathJaxHelper.queue(this.viewDiv, () => this.dispatchAction('cell-height-changed'));
        }
    }

    getActionButtonConfig() {
        if (this.effectiveIsLocked || !this.effectiveIsEditable) return null;
        if (this.isEditing) {
            return { icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`, title: 'Render Markdown (Shift+Enter)' };
        } else {
            return { icon: `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`, title: 'Edit Markdown' };
        }
    }

    handleActionClick() {
        if (this.effectiveIsLocked || !this.effectiveIsEditable) return;
        this.isEditing = !this.isEditing;
        
        if ((this as any).yMap) {
            (this as any).yMap.set('isEditing', this.isEditing);
        } else {
            if (this.isEditing) this.setAttribute('is-editing', '');
            else this.removeAttribute('is-editing');
        }

        if (!this.isEditing) this.renderMarkdown();
        this.toggleMode();
        if (!(this as any).yText) {
            this.dispatchAction('cell-content-changed');
        }
    }

    toggleMode() {
        if (this.isEditing) {
            this.viewDiv.classList.add('hidden');
            this.editDiv.classList.remove('hidden');
            this.editDiv.classList.add('flex');
            setTimeout(() => { 
                if (this.editorView) {
                    this.editorView.focus();
                }
            }, 0);
        } else {
            this.editDiv.classList.add('hidden');
            this.editDiv.classList.remove('flex');
            this.viewDiv.classList.remove('hidden');
            this.dispatchAction('cell-height-changed');
        }
        this.updateActionButton(this.getActionButtonConfig());
    }

    refresh() { 
        this.dispatchAction('cell-height-changed');
    }
    
    focusCell() { 
        if (this.isEditing && this.editorView && !this.effectiveIsLocked && this.effectiveIsEditable) {
            this.editorView.focus(); 
        }
    }

    toJSON() {
        const base: any = super.toJSON();
        // this.content is kept perfectly in sync by the updateListener
        base.content = this.content;
        return base;
    }
}
customElements.define('notebook-markdown-cell', MarkdownCellElement);
