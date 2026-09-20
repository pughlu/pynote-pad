import { test, expect } from '@playwright/test';

test.describe('View Synchronization & Preview Mode Constraints', () => {
  test('should synchronize content between Visual Editor and Raw Text views (.pynote.py and .ipynb)', async ({ page }) => {
    // 1. Open IDE
    await page.goto('/ide.html');
    await page.waitForLoadState('networkidle');

    const codeCell = page.locator('notebook-code-cell').first();
    await expect(codeCell).toBeVisible();

    // 2. Type into CodeMirror in Code Cell
    const cmContent = codeCell.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('test_sync_var = 4242');

    // 3. Switch to .pynote.py (Raw) view
    await page.locator('#menu-btn-view').click();
    await page.locator('#menu-view-flatfile').click();

    const rawWrapper = page.locator('#raw-editor-wrapper');
    await expect(rawWrapper).toBeVisible();

    const textarea = page.locator('#raw-editor-textarea');
    const flatContent = await textarea.inputValue();
    expect(flatContent).toContain('test_sync_var = 4242');

    // 4. Switch to .ipynb (Raw) view
    await page.locator('#menu-btn-view').click();
    await page.locator('#menu-view-jupyter').click();

    const ipynbContent = await textarea.inputValue();
    expect(ipynbContent).toContain('test_sync_var = 4242');

    // 5. Edit in raw view
    await textarea.fill(ipynbContent.replace('4242', '9999'));

    // 6. Switch back to Visual Editor
    await page.locator('#menu-btn-view').click();
    await page.locator('#menu-view-visual').click();

    const visualWrapper = page.locator('#visual-editor-wrapper');
    await expect(visualWrapper).toBeVisible();

    // Check CodeMirror content updated
    await expect(codeCell.locator('.cm-content')).toContainText('test_sync_var = 9999');
  });

  test('should respect moveable, editable, and deletable tags in Preview mode', async ({ page }) => {
    await page.goto('/ide.html');
    await page.waitForLoadState('networkidle');

    const codeCell = page.locator('notebook-code-cell').first();
    await expect(codeCell).toBeVisible();

    // Click code cell to open cell config
    await codeCell.click();
    await page.waitForTimeout(300);

    // Uncheck Moveable
    const moveCheckbox = page.locator('#cell-config-moveable');
    if (await moveCheckbox.isChecked()) {
      await moveCheckbox.click();
    }

    // Uncheck Deletable
    const deleteCheckbox = page.locator('#cell-config-deletable');
    if (await deleteCheckbox.isChecked()) {
      await deleteCheckbox.click();
    }

    // Uncheck Editable
    const editCheckbox = page.locator('#cell-config-editable');
    if (await editCheckbox.isChecked()) {
      await editCheckbox.click();
    }

    // Verify cell attributes in DOM
    await expect(codeCell).toHaveAttribute('is-moveable', 'false');
    await expect(codeCell).toHaveAttribute('is-deletable', 'false');
    await expect(codeCell).toHaveAttribute('is-editable', 'false');

    // Switch to Preview Mode
    await page.locator('#menu-btn-view').click();
    await page.locator('#menu-view-preview').click();

    const previewCodeCell = page.locator('notebook-code-cell').first();
    await expect(previewCodeCell).toBeVisible();

    // Verify drag handle is hidden
    const dragHandle = previewCodeCell.locator('.drag-handle');
    await expect(dragHandle).toBeHidden();

    // Verify delete button is hidden
    const deleteBtn = previewCodeCell.locator('.delete-btn, button[title="delete cell"]');
    await expect(deleteBtn).toBeHidden();

    // Verify CodeMirror wrapper is locked (pointer-events-none / non-editable styling)
    const cmWrapper = previewCodeCell.locator('.cm-wrapper');
    await expect(cmWrapper).toHaveClass(/pointer-events-none/);
  });
});
