import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";

// Mimic the basicSetup extension array from classic CM6
const basicSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap
  ])
];

// Helper functions that mimic the old global object behavior
function createEditorView(state?: EditorState, parent?: Element) {
  return new EditorView({
    state: state,
    parent: parent
  });
}

function createEditorState(doc: string, config: { extensions: any[] }) {
  return EditorState.create({
    doc,
    extensions: config.extensions
  });
}

export {
  EditorState,
  EditorView,
  basicSetup,
  python,
  keymap,
  indentMore,
  indentLess,
  indentUnit,
  createEditorView,
  createEditorState
};
