# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: config-panel.spec.ts >> Cell Config Panel Persistence >> should persist config changes when switching between cells
- Location: tests/e2e/config-panel.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('notebook-markdown-cell').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('notebook-markdown-cell').first() with timeout 5000ms
  - waiting for locator('notebook-markdown-cell').first()

```

```yaml
- button "Choose File"
- navigation
- complementary
- main
- complementary
- text: "[plugin:vite:import-analysis] Failed to resolve import \"@pynote/core/notebook-format\" from \"packages/ide/src/collaboration/yjs-provider.ts\". Does the file exist? /Users/philiplewis/pynote/pynote/packages/ide/src/collaboration/yjs-provider.ts:5:40 2 | import * as Y from \"yjs\"; 3 | import { yCollab } from \"y-codemirror.next\"; 4 | import { NotebookFormatConverter } from \"@pynote/core/notebook-format\"; | ^ 5 | export class YjsTextAdapter { 6 | ytext; at TransformPluginContext._formatLog (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:8393:39) at TransformPluginContext.error (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:8390:14) at normalizeUrl (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:26058:18) at async file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:26128:30 at async Promise.all (index 2) at async TransformPluginContext.transform (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:26094:4) at async EnvironmentPluginContainer.transform (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:8172:14) at async loadAndTransform (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:19634:26) at async viteTransformMiddleware (file:///Users/philiplewis/pynote/pynote/node_modules/vite/dist/node/chunks/node.js:19853:20) Click outside, press Esc key, or fix the code to dismiss. You can also disable this overlay by setting"
- code: server.hmr.overlay
- text: to
- code: "false"
- text: in
- code: vite.config.ts
- text: .
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Cell Config Panel Persistence', () => {
  4  |   test('should persist config changes when switching between cells', async ({ page }) => {
  5  |     // 1. Open the PyNote IDE
  6  |     await page.goto('/packages/ide/index.html');
  7  | 
  8  |     // 2. Wait for the editor to load the default cells
  9  |     // The default template has a markdown cell and a code cell.
  10 |     const markdownCell = page.locator('notebook-markdown-cell').first();
  11 |     const codeCell = page.locator('notebook-code-cell').first();
  12 | 
> 13 |     await expect(markdownCell).toBeVisible();
     |                                ^ Error: expect(locator).toBeVisible() failed
  14 |     await expect(codeCell).toBeVisible();
  15 | 
  16 |     // 3. Click the Code cell to select it and open the Config Panel
  17 |     await codeCell.click();
  18 | 
  19 |     // 4. Verify the Config Panel has Cell Config section
  20 |     const cellConfigHeader = page.locator('#cell-config-header');
  21 |     await expect(cellConfigHeader).toBeVisible();
  22 |     
  23 |     // Wait for the cell config panel to become active
  24 |     const cellConfigPanel = page.locator('#cell-config-panel');
  25 |     await expect(cellConfigPanel).not.toHaveClass(/pointer-events-none/);
  26 | 
  27 |     // Find the locked checkbox and check it
  28 |     const lockedCheckbox = page.locator('#cell-config-locked');
  29 |     await lockedCheckbox.check();
  30 | 
  31 |     // 5. Verify the code cell now has the 'is-locked' attribute
  32 |     await expect(codeCell).toHaveAttribute('is-locked', '');
  33 | 
  34 |     // 6. Click away to the Markdown cell
  35 |     await markdownCell.click();
  36 | 
  37 |     // 7. Verify the markdown cell is now selected
  38 |     // Code cell should still have the 'is-locked' attribute, ensuring the store persisted it
  39 |     await expect(codeCell).toHaveAttribute('is-locked', '');
  40 | 
  41 |     // 8. Click back to the Code cell
  42 |     await codeCell.click();
  43 |     await expect(cellConfigPanel).not.toHaveClass(/pointer-events-none/);
  44 | 
  45 |     // 9. Verify the checkbox is still checked
  46 |     await expect(lockedCheckbox).toBeChecked();
  47 |   });
  48 | });
  49 | 
```