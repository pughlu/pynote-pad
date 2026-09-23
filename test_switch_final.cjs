const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:5174');
  
  // Wait for the custom element to be defined and kernel to be ready
  await page.waitForFunction(() => customElements.get('notebook-code-cell') !== undefined);
  await page.waitForTimeout(2000);
  
  console.log("Switching kernel...");
  await page.selectOption('.kernel-selector', 'pyodide');
  
  // Wait 3 seconds for the new Pyodide kernel to initialize completely
  await page.waitForTimeout(3000);
  
  console.log("Evaluating...");
  const output = await page.evaluate(async () => {
      const cell = document.querySelector('notebook-code-cell');
      cell.content = 'print("Hello from Pyodide!!")';
      await cell.runCode();
      return cell.outputContent ? cell.outputContent.innerText : "NO_OUTPUT_CONTENT";
  });
  
  console.log("TEST RESULT:", output);
  
  await browser.close();
})();
