// pyodide-worker.js

// Using importScripts to bypass Safari ES Module COEP bugs
importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide = null;
let currentExecId = null;
let initPromise = null; // Prevents concurrent initializations in Singleton mode
const namespaces = {};  // Stores isolated globals for each widget
let interruptBuffer = null;
let inputBuffer = null;

// Expose a JS function to Python for SVG matplotlib rendering
self.sendSvg = function(svgStr) {
    self.postMessage({ id: currentExecId, type: 'svg', data: svgStr });
};

// Expose a JS function to Python for interactive input()
self.custom_input_prompt = function(promptText) {
    if (!inputBuffer) {
        throw new Error("Input requires SharedArrayBuffer which is disabled. Ensure Cross-Origin Isolation headers are set.");
    }
    self.postMessage({ id: currentExecId, type: 'stdin_prompt', prompt: promptText });
    inputBuffer[0] = 0;
    Atomics.wait(inputBuffer, 0, 0); // Synchronously pause the worker!
    const len = inputBuffer[0];
    const text = new TextDecoder().decode(new Uint8Array(inputBuffer.buffer, 4, len));
    return text;
};

self.onmessage = async function(e) {
    const msg = e.data;
    
    // Fallback to 'default' if running locally without an ID
    const widgetId = msg.widgetId || 'default'; 

    if (msg.action === 'INIT') {
        try {
            self.postMessage({ id: msg.id, type: 'status', status: 'loading' });
            
            // Initialization Latch: Ensure Pyodide only loads once
            if (!initPromise) {
                initPromise = (async () => {
                    pyodide = await loadPyodide({
                        stdout: (text) => self.postMessage({ id: currentExecId, type: 'stdout', text }),
                        stderr: (text) => self.postMessage({ id: currentExecId, type: 'stderr', text }),
                        stdin: () => {
                            if (!inputBuffer) {
                                throw new Error("Input requires SharedArrayBuffer which is disabled. Ensure Cross-Origin Isolation headers are set.");
                            }
                            self.postMessage({ id: currentExecId, type: 'stdin_request' });
                            inputBuffer[0] = 0;
                            Atomics.wait(inputBuffer, 0, 0); // Synchronously pause the worker!
                            const len = inputBuffer[0];
                            const text = new TextDecoder().decode(new Uint8Array(inputBuffer.buffer, 4, len));
                            return text;
                        }
                    });

                    if (msg.interruptBuffer) {
                        interruptBuffer = new Uint8Array(msg.interruptBuffer);
                        pyodide.setInterruptBuffer(interruptBuffer);
                    }
                    if (msg.inputBuffer) {
                        inputBuffer = new Int32Array(msg.inputBuffer);
                    }

                    await pyodide.runPythonAsync(`
import builtins
import js
def _custom_input(prompt=""):
    return js.custom_input_prompt(prompt)
builtins.input = _custom_input
                    `);

                    if (msg.config.preloadMatplotlib) {
                        self.postMessage({ id: msg.id, type: 'status', status: 'packages' }); 
                        await pyodide.loadPackage(['matplotlib', 'numpy']);
                        
                        // Setup matplotlib headless SVG rendering
                        const setupCode = `
import matplotlib
matplotlib.use('svg')
import matplotlib.pyplot as plt
import io
import js
import sys

def _custom_show():
    # Pause the timeout tracer while Matplotlib renders to avoid unfair timeouts
    _prev_trace = sys.gettrace()
    sys.settrace(None)
    
    try:
        buf = io.BytesIO()
        plt.savefig(buf, format='svg', bbox_inches='tight')
        buf.seek(0)
        js.sendSvg(buf.read().decode('utf-8'))
        plt.close()
    finally:
        sys.settrace(_prev_trace)

plt.show = _custom_show
`;
                        await pyodide.runPythonAsync(setupCode);
                    }
                })();
            }
            
            await initPromise;
            self.postMessage({ id: msg.id, type: 'status', status: 'ready' });
        } catch (err) {
            self.postMessage({ id: msg.id, type: 'status', status: 'error', error: err.message });
        }
    } 
    else if (msg.action === 'EXECUTE') {
        currentExecId = msg.id;
        console.log("[PyNote Web Worker] Executing cell inside Pyodide Web Worker...");
        
        if (!namespaces[widgetId]) {
            namespaces[widgetId] = pyodide.globals.get('dict')();
        }
        const widgetNamespace = namespaces[widgetId];
        
        const enableTracing = msg.config.enableTracing !== false; 
        const maxRuntime = msg.config.maxRuntime || 15.0; 

        try {
            if (msg.code.includes('import ')) {
                await pyodide.loadPackagesFromImports(msg.code);
            }
            
            if (enableTracing) {
                await pyodide.runPythonAsync(`
import sys
import time
_pynote_start_time = time.time()
_pynote_tick = 0

def _pynote_tracer(frame, event, arg):
    if not frame.f_code.co_filename.startswith("<"):
        return None
        
    global _pynote_tick
    _pynote_tick += 1
    
    if _pynote_tick > 100:
        _pynote_tick = 0
        if time.time() - _pynote_start_time > ${maxRuntime}:
            sys.settrace(None)
            raise TimeoutError("Execution stopped: Time limit (${maxRuntime}s) exceeded.")
            
    return _pynote_tracer

sys.settrace(_pynote_tracer)
                `);
            }

            let result = await pyodide.runPythonAsync(msg.code, { globals: widgetNamespace });
            
            if (enableTracing) {
                await pyodide.runPythonAsync(`sys.settrace(None)`); 
            }
            
            if (msg.config.preloadMatplotlib) {
                try { await pyodide.runPythonAsync(`import matplotlib.pyplot as plt\nif plt.get_fignums(): plt.show()`, { globals: widgetNamespace }); } catch(e) {}
            }

            if (result !== undefined) {
                widgetNamespace.set('_last_result', result);
                const reprStr = pyodide.runPython('repr(_last_result)', { globals: widgetNamespace });
                if (reprStr !== 'None') {
                    self.postMessage({ id: currentExecId, type: 'result', text: reprStr });
                }
            }
            
            self.postMessage({ id: currentExecId, type: 'success' });
        } catch (err) {
            if (enableTracing) {
                try { await pyodide.runPythonAsync(`sys.settrace(None)`); } catch(e) {}
            }
            self.postMessage({ id: currentExecId, type: 'error', error: err.toString() });
        }
        currentExecId = null;
    }
};