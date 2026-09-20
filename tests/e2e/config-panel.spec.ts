import { test, expect } from '@playwright/test';

test.describe('Cell Config Panel Persistence', () => {
  test('should persist config changes when switching between cells', async ({ page }) => {
    // 1. Open the PyNote IDE
    await page.goto('/ide.html');

    // 2. Wait for the editor to load the default cells
    // The default template has a markdown cell and a code cell.
    const markdownCell = page.locator('notebook-markdown-cell').first();
    const codeCell = page.locator('notebook-code-cell').first();

    await expect(markdownCell).toBeVisible();
    await expect(codeCell).toBeVisible();

    // 3. Click the Code cell to select it and open the Config Panel
    await codeCell.click();

    // 4. Verify the Config Panel has Cell Config section
    const cellConfigHeader = page.locator('#cell-config-header');
    await expect(cellConfigHeader).toBeVisible();
    
    // Wait for the cell config panel to become active
    const cellConfigPanel = page.locator('#cell-config-panel');
    await expect(cellConfigPanel).not.toHaveClass(/pointer-events-none/);

    // Find the locked checkbox and check it
    const lockedCheckbox = page.locator('#cell-config-locked');
    await lockedCheckbox.check();

    // 5. Verify the code cell now has the 'is-locked' attribute
    await expect(codeCell).toHaveAttribute('is-locked', '');

    // 6. Click away to the Markdown cell
    await markdownCell.click();

    // 7. Verify the markdown cell is now selected
    // Code cell should still have the 'is-locked' attribute, ensuring the store persisted it
    await expect(codeCell).toHaveAttribute('is-locked', '');

    // 8. Click back to the Code cell
    await codeCell.click();
    await expect(cellConfigPanel).not.toHaveClass(/pointer-events-none/);

    // 9. Verify the checkbox is still checked
    await expect(lockedCheckbox).toBeChecked();
  });
});
