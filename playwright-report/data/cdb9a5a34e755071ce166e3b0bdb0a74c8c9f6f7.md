# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: view-sync-and-preview.spec.ts >> View Synchronization & Preview Mode Constraints >> should synchronize content between Visual Editor and Raw Text views (.pynote.py and .ipynb)
- Location: tests/e2e/view-sync-and-preview.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('notebook-code-cell').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('notebook-code-cell').first() with timeout 5000ms
  - waiting for locator('notebook-code-cell').first()

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('View Synchronization & Preview Mode Constraints', () => {
  4   |   test('should synchronize content between Visual Editor and Raw Text views (.pynote.py and .ipynb)', async ({ page }) => {
  5   |     // 1. Open IDE
  6   |     await page.goto('/packages/ide/index.html');
  7   |     await page.waitForLoadState('networkidle');
  8   | 
  9   |     const codeCell = page.locator('notebook-code-cell').first();
> 10  |     await expect(codeCell).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  11  | 
  12  |     // 2. Type into CodeMirror in Code Cell
  13  |     const cmContent = codeCell.locator('.cm-content');
  14  |     await cmContent.click();
  15  |     await page.keyboard.press('ControlOrMeta+A');
  16  |     await page.keyboard.type('test_sync_var = 4242');
  17  | 
  18  |     // 3. Switch to .pynote.py (Raw) view
  19  |     await page.locator('#menu-btn-view').click();
  20  |     await page.locator('#menu-view-flatfile').click();
  21  | 
  22  |     const rawWrapper = page.locator('#raw-editor-wrapper');
  23  |     await expect(rawWrapper).toBeVisible();
  24  | 
  25  |     const textarea = page.locator('#raw-editor-textarea');
  26  |     const flatContent = await textarea.inputValue();
  27  |     expect(flatContent).toContain('test_sync_var = 4242');
  28  | 
  29  |     // 4. Switch to .ipynb (Raw) view
  30  |     await page.locator('#menu-btn-view').click();
  31  |     await page.locator('#menu-view-jupyter').click();
  32  | 
  33  |     const ipynbContent = await textarea.inputValue();
  34  |     expect(ipynbContent).toContain('test_sync_var = 4242');
  35  | 
  36  |     // 5. Edit in raw view
  37  |     await textarea.fill(ipynbContent.replace('4242', '9999'));
  38  | 
  39  |     // 6. Switch back to Visual Editor
  40  |     await page.locator('#menu-btn-view').click();
  41  |     await page.locator('#menu-view-visual').click();
  42  | 
  43  |     const visualWrapper = page.locator('#visual-editor-wrapper');
  44  |     await expect(visualWrapper).toBeVisible();
  45  | 
  46  |     // Check CodeMirror content updated
  47  |     await expect(codeCell.locator('.cm-content')).toContainText('test_sync_var = 9999');
  48  |   });
  49  | 
  50  |   test('should respect moveable, editable, and deletable tags in Preview mode', async ({ page }) => {
  51  |     await page.goto('/packages/ide/index.html');
  52  |     await page.waitForLoadState('networkidle');
  53  | 
  54  |     const codeCell = page.locator('notebook-code-cell').first();
  55  |     await expect(codeCell).toBeVisible();
  56  | 
  57  |     // Click code cell to open cell config
  58  |     await codeCell.click();
  59  |     await page.waitForTimeout(300);
  60  | 
  61  |     // Uncheck Moveable
  62  |     const moveCheckbox = page.locator('#cell-config-moveable');
  63  |     if (await moveCheckbox.isChecked()) {
  64  |       await moveCheckbox.click();
  65  |     }
  66  | 
  67  |     // Uncheck Deletable
  68  |     const deleteCheckbox = page.locator('#cell-config-deletable');
  69  |     if (await deleteCheckbox.isChecked()) {
  70  |       await deleteCheckbox.click();
  71  |     }
  72  | 
  73  |     // Uncheck Editable
  74  |     const editCheckbox = page.locator('#cell-config-editable');
  75  |     if (await editCheckbox.isChecked()) {
  76  |       await editCheckbox.click();
  77  |     }
  78  | 
  79  |     // Verify cell attributes in DOM
  80  |     await expect(codeCell).toHaveAttribute('is-moveable', 'false');
  81  |     await expect(codeCell).toHaveAttribute('is-deletable', 'false');
  82  |     await expect(codeCell).toHaveAttribute('is-editable', 'false');
  83  | 
  84  |     // Switch to Preview Mode
  85  |     await page.locator('#menu-btn-view').click();
  86  |     await page.locator('#menu-view-preview').click();
  87  | 
  88  |     const previewCodeCell = page.locator('notebook-code-cell').first();
  89  |     await expect(previewCodeCell).toBeVisible();
  90  | 
  91  |     // Verify drag handle is hidden
  92  |     const dragHandle = previewCodeCell.locator('.drag-handle');
  93  |     await expect(dragHandle).toBeHidden();
  94  | 
  95  |     // Verify delete button is hidden
  96  |     const deleteBtn = previewCodeCell.locator('.delete-btn, button[title="delete cell"]');
  97  |     await expect(deleteBtn).toBeHidden();
  98  | 
  99  |     // Verify CodeMirror wrapper is locked (pointer-events-none / non-editable styling)
  100 |     const cmWrapper = previewCodeCell.locator('.cm-wrapper');
  101 |     await expect(cmWrapper).toHaveClass(/pointer-events-none/);
  102 |   });
  103 | });
  104 | 
```