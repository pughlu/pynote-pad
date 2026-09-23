const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5174');
  
  await page.waitForTimeout(2000);
  
  await page.selectOption('.kernel-selector', 'pyodide');
  console.log("Switched to Pyodide. Waiting for ready...");
  
  await page.waitForTimeout(2000);
  
  const codeCell = await page.$('notebook-code-cell');
  if (codeCell) {
    const runBtn = await codeCell.$('.run-button, [title*="Run"], button'); 
    if (runBtn) {
        await runBtn.click();
        console.log("Clicked Run.");
    } else {
        console.log("Run button not found in cell.");
    }
  } else {
    console.log("No code cell found.");
  }
  
  await page.waitForTimeout(3000);
  
  if (codeCell) {
    const output = await codeCell.$('.output-content');
    if (output) {
      console.log("OUTPUT:", await output.innerText());
    } else {
      const output2 = await codeCell.$('div[class*="output"]');
      if (output2) console.log("OUTPUT2:", await output2.innerText());
    }
  }
  
  await browser.close();
})();
