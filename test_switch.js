const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5174');
  
  // Wait for load
  await page.waitForTimeout(2000);
  
  // Switch kernel
  await page.selectOption('#kernel-selector', 'pyodide');
  console.log("Switched to Pyodide. Waiting for ready...");
  
  // Wait for 2 seconds to allow init to complete
  await page.waitForTimeout(2000);
  
  // Run the first code cell
  // The run button is inside the code cell. 
  // Let's find the first code cell and click run.
  const codeCell = await page.$('notebook-code-cell');
  if (codeCell) {
    const runBtn = await codeCell.$('.run-button, [title*="Run"]'); // the play button
    if (runBtn) {
        await runBtn.click();
        console.log("Clicked Run.");
    } else {
        console.log("Run button not found in cell.");
    }
  } else {
    console.log("No code cell found.");
  }
  
  // Wait for execution
  await page.waitForTimeout(2000);
  
  // Check output
  if (codeCell) {
    const output = await codeCell.$('.code-output');
    if (output) {
      console.log("OUTPUT:", await output.innerText());
    }
  }
  
  await browser.close();
})();
