const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:5174');
  
  await page.waitForTimeout(2000);
  
  console.log("Switching kernel...");
  await page.selectOption('#kernel-selector', 'pyodide');
  
  await page.waitForTimeout(4000);
  
  console.log("Evaluating...");
  const output = await page.evaluate(async () => {
      const dummyDiv = document.createElement('div');
      try {
          await window.notebookCore.kernel.execute('print("Hello from Pyodide directly!!")', dummyDiv);
          return dummyDiv.innerHTML;
      } catch (err) {
          return "ERROR: " + err.toString();
      }
  });
  
  console.log("TEST RESULT:", output);
  
  await browser.close();
})();
