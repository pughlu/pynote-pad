# Recent Changes

## Reset Kernel Button Animation
Enhanced the UI feedback when restarting the Python kernel to provide a more satisfying and noticeable tactile response.

* **`index.html`**: Added the `id="icon-restart-kernel"` attribute to the SVG icon inside the kernel restart button to allow for direct DOM manipulation.
* **`src/notebook-generic.ts` (`updateKernelStatus`)**: Added logic to dynamically toggle the Tailwind `animate-spin` class on the restart icon and change the kernel status indicator light to a pulsing orange (`bg-orange-500`) while the kernel is in the `loading` state. Once the kernel is `ready`, the spinning stops and the light turns green.
* **`src/notebook-generic.ts` (`restartKernel`)**: Introduced a 300ms artificial delay (`setTimeout`) before re-initializing the kernel. Since some kernels (like Pyodide) re-initialize almost instantly from memory, this brief delay ensures that the reset animation and orange light are visible to the user long enough to register the action.

## Inline MathJax Alignment
Fixed an issue where inline MathJax equations were rendering slightly below the text baseline inside Markdown cells.

* **`src/markdown-styles.css`**: Added a new global CSS rule targeting inline MathJax containers (`mjx-container:not([display="true"])`). Applied a relative positioning shift (`top: -0.33em;`) to perfectly align the inline math output with the surrounding text baseline.
