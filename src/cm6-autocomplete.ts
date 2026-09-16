import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

export function customVariableCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[a-zA-Z_]\w*/);

  // If typing automatically, require >= 4 characters.
  // If explicitly requested via Ctrl+Space, allow >= 1 characters.
  if (!context.explicit) {
    if (!word || word.text.length < 4) return null;
  } else {
    if (!word) return null;
  }

  let allCodeText = context.state.doc.toString();

  // Cross-cell discovery: Grab text from all other notebook code cells
  if (typeof window !== 'undefined' && (window as any).notebookCore && (window as any).notebookCore.container) {
    const codeCells = (window as any).notebookCore.container.querySelectorAll('notebook-code-cell');
    const combined: string[] = [];
    codeCells.forEach((cell: any) => {
      if (cell.editorView) combined.push(cell.editorView.state.doc.toString());
      else if (cell.content) combined.push(cell.content);
    });
    if (combined.length > 0) allCodeText = combined.join('\n');
  }

  const identifiers = allCodeText.match(/\b[a-zA-Z_]\w*\b/g) || [];

  const pythonKeywords = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 
    'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 
    'with', 'yield', 'print', 'range', 'len', 'int', 'str', 'float', 'list', 'dict', 'set'
  ]);

  // Unique identifiers excluding keywords AND the word currently being typed
  const variables = [...new Set(identifiers)].filter(v => 
    !pythonKeywords.has(v) && v !== word.text
  );

  if (variables.length === 0) return null;

  return {
    from: word.from,
    options: variables.map(v => ({ 
      label: v, 
      type: "variable",
      boost: 1 
    }))
  };
}
