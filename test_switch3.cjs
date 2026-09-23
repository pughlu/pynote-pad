const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5174');
  await page.waitForTimeout(1000);
  
  await page.evaluate(async () => {
      console.log("Switching to Pyodide...");
      window.notebookCore.switchKernel('pyodide');
      
      // wait 2 seconds for init
      await new Promise(r => setTimeout(r, 2000));
      
      console.log("Running code...");
      const dummyDiv = document.createElement('div');
      try {
          await window.notebookCore.kernel.execute('print("Hello World!")', dummyDiv);
          console.log("EXECUTE SUCCESS, HTML:", dummyDiv.innerHTML);
      } catch (err) {
          console.log("EXECUTE ERROR:", err);
      }
  });
  
  await page.waitForTimeout(1000);
  await browser.close();
})();
