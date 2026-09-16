# PyNote

PyNote is a lightweight, embeddable, and highly configurable Python notebook widget designed specifically for educational platforms and Learning Management Systems (LMS) like Moodle. 

It provides a Jupyter-like experience entirely in the browser, featuring dual runtime kernels, Markdown support with MathJax, and a portable, native Python `.pynote.py` format.

## Features

- **In-Browser Execution**: Runs Python completely client-side.
  - **Skulpt Kernel**: Fast, lightweight runtime perfect for basic scripts, algorithms, and turtle graphics.
  - **Pyodide Kernel**: Full CPython WebAssembly runtime supporting major libraries (NumPy, Pandas, Matplotlib).
- **Portable Format (`.pynote.py`)**: Notebooks are saved as standard, executable `.py` files using structural comment blocks (`# %% [code]`), allowing them to be run locally in standard Python IDEs while rendering as interactive cells in PyNote.
- **Standalone Web IDE**: An integrated playground (`ide.html`) for authoring, testing, and exporting notebooks. Includes URL-based compression for instant sharing.
- **Strict UI Constraints (Question Mode)**: Highly configurable UI perfect for exams and assignments. Lock markdown cells, prevent cell deletion, and disable code block insertions to keep students focused.
- **LMS Ready**: Out-of-the-box support for Moodle quiz integration (`pynote-mdl-quiz.js`), allowing automatic template injection and answer extraction.

## Project Structure

```text
pynote/
├── public/                 # Static assets and entry scripts (pynote.js, pynote-mdl-quiz.js)
├── src/
│   ├── notebook-generic.ts # Core notebook engine and UI manager
│   ├── notebook-format.ts  # Parser/Serializer for the .pynote.py flatfile format
│   ├── code-cells.ts       # CodeMirror 6 editor instances and execution bridges
│   ├── markdown-cells.ts   # Markdown rendering with MathJax support
│   └── text-cells.ts       # Plaintext response blocks
├── index.html              # The embeddable widget entry point
└── ide.html                # The standalone web IDE entry point
```

## Getting Started (Development)

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start the Dev Server**:
   ```bash
   npm run dev
   ```
   - Embeddable Widget: `http://localhost:5173/`
   - Standalone IDE: `http://localhost:5173/ide.html`

3. **Build for Production**:
   ```bash
   npm run build
   ```
   This compiles the TypeScript modules and bundles the CodeMirror dependencies into `dist/`.

## Embedding PyNote

PyNote can be embedded on any webpage by dropping a `<pynote>` HTML tag and loading the `pynote.js` script.

```html
<pynote data-kernel-type="skulpt" data-question-mode="true">
# %% [markdown]
"""
Calculate the sum of 1 and 2:
"""
# %% [code]
print(1 + 2)
</pynote>

<script src="dist/pynote.js"></script>
```

For advanced configuration options and integration instructions, please see the [USERGUIDE.md](USERGUIDE.md).
