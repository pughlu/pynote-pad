import { basicSetup } from "codemirror";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { python } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { indentMore, indentLess } from "@codemirror/commands";
import { search, openSearchPanel } from "@codemirror/search";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { customVariableCompletions } from "./cm6-autocomplete";

export function getAutocompleteExtensions(mode: string = "custom"): Extension[] {
  const baseKeymap = [
    { key: "Tab", run: (view: EditorView) => acceptCompletion(view) || indentMore(view) },
    { key: "Shift-Tab", run: indentLess }
  ];

  if (mode === "off") {
    return [
      keymap.of([
        { key: "Tab", run: indentMore },
        { key: "Shift-Tab", run: indentLess }
      ]),
      // Overrides basicSetup to fully suppress popups
      autocompletion({ override: [() => null] })
    ];
  }

  if (mode === "custom") {
    return [
      keymap.of(baseKeymap),
      autocompletion({
        override: [customVariableCompletions],
        activateOnTyping: true, 
        maxRenderedOptions: 10
      })
    ];
  }

  if (mode === "full") {
    return [
      keymap.of(baseKeymap),
      autocompletion({ activateOnTyping: true })
    ];
  }

  return [keymap.of(baseKeymap)];
}

// Unified PyNote Theme to keep CSS minimal
export const pynoteTheme = EditorView.theme({
    "&": { backgroundColor: "transparent" },
    ".cm-scroller": { fontFamily: "'Fira Code', monospace", fontSize: "14px" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#3b82f6" },
    "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#bfdbfe" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-gutters": { backgroundColor: "transparent", borderRight: "none", color: "#94a3b8" }
});

// Helper functions that mimic the old global object behavior
export function createEditorView(state?: EditorState, parent?: Element) {
  return new EditorView({
    state: state,
    parent: parent
  });
}

export function createEditorState(doc: string, config: { extensions: Extension[] }) {
  return EditorState.create({
    doc,
    extensions: config.extensions
  });
}

// Export namespaces and modules for backwards compatibility
export const language = { indentUnit };
export const state = { EditorState };
export const view = { EditorView };
export const commands = { indentMore, indentLess };

export {
  EditorState,
  EditorView,
  basicSetup,
  python,
  keymap,
  indentMore,
  indentLess,
  indentUnit,
  search,
  openSearchPanel,
  autocompletion,
  acceptCompletion,
  customVariableCompletions
};

// Also expose onto window.cm6 so any external/Moodle scripts or plugins continue to work seamlessly
if (typeof window !== 'undefined') {
  (window as any).cm6 = {
    EditorView,
    EditorState,
    basicSetup,
    python,
    language,
    state,
    view,
    keymap,
    commands,
    search,
    openSearchPanel,
    getAutocompleteExtensions,
    pynoteTheme,
    createEditorState,
    createEditorView
  };
}
