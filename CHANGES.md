# Recent Changes

## Reset Kernel Button Animation
Enhanced the UI feedback when restarting the Python kernel to provide a more satisfying and noticeable tactile response.

* **`index.html`**: Added the `id="icon-restart-kernel"` attribute to the SVG icon inside the kernel restart button to allow for direct DOM manipulation.
* **`src/notebook-generic.ts` (`updateKernelStatus`)**: Added logic to dynamically toggle the Tailwind `animate-spin` class on the restart icon and change the kernel status indicator light to a pulsing orange (`bg-orange-500`) while the kernel is in the `loading` state. Once the kernel is `ready`, the spinning stops and the light turns green.
* **`src/notebook-generic.ts` (`restartKernel`)**: Introduced a 300ms artificial delay (`setTimeout`) before re-initializing the kernel. Since some kernels (like Pyodide) re-initialize almost instantly from memory, this brief delay ensures that the reset animation and orange light are visible to the user long enough to register the action.

## Inline MathJax Alignment
Fixed an issue where inline MathJax equations were rendering slightly below the text baseline inside Markdown cells.

* **`src/markdown-styles.css`**: Added a new global CSS rule targeting inline MathJax containers (`mjx-container:not([display="true"])`). Applied a relative positioning shift (`top: -0.1em;`) to perfectly align the inline math output with the surrounding text baseline.

## Template Definition & Markdown Cells
Enhanced the widget mounting script to allow standard `<pre>` tags to act as template containers, and removed placeholder text for a cleaner UI.

* **`public/pynote.js` & `public/pynote-mdl-quiz.js`**: Updated the target selector to match `pre.pynote` and modified the `starterCode` extraction logic so that `<pre class="pynote">` tags can now natively provide starter code for the widget. This replaces the reliance on `data-add-pynote-here` attribute placeholders, allowing for better fallback formatting and preventing WYSIWYG editors from stripping non-standard `<pynote>` tags.
* **`src/markdown-cells.ts`**: Removed the default placeholder text ("Type Markdown here...") from new Markdown cells, allowing them to render completely empty.

## UI Tweaks
Refined the widget UI for clarity and consistency.

* **`index.html`**:
  * Commented out logic that forced the "Reset to Original Template" button to display by default.
  * Renamed the kernel options from "Pyodide" and "Skulpt" to "Python (Pyodide)" and "Python (Skulpt)".
  * Updated the kernel restart button to include a "RESET" label and changed its mouseover tooltip to "Click to re-initialise the Python environment".
* **`src/notebook-generic.ts` (`restartKernel`)**: Increased the artificial reset delay from 300ms to 700ms to make the reset feedback animation more obvious.
