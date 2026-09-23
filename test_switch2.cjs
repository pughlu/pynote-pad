const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5174');
  
  await page.waitForTimeout(2000);
  
  await page.selectOption('#kernel-selector', 'pyodide');
  console.log("Switched to Pyodide.");
  
  await page.waitForTimeout(2000);
  
  // get code cell and output
  await page.evaluate(async () => {
      const cell = document.querySelector('notebook-code-cell');
      cell.content = 'print("Hello from Pyodide!")';
      await cell.runCode();
  });
  
  await page.waitForTimeout(2000);
  
  await page.evaluate(() => {
      const cell = document.querySelector('notebook-code-cell');
      console.log("CELL HTML:", cell.innerHTML);
  });
  
  await browser.close();
})();
