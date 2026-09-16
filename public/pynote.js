(function() {
    const currentScript = document.currentScript;
    let defaultOrigin = 'http://localhost:5173';
    
    if (currentScript && currentScript.src) {
        try {
            defaultOrigin = new URL(currentScript.src).origin;
        } catch (e) { }
    }

    function cleanTemplateContent(text) {
        if (!text) return '';
        let cleaned = text.replace(/^\s*\n/, '').replace(/\s+$/, '');
        const lines = cleaned.split('\n');
        let minIndent = Infinity;
        for (const line of lines) {
            if (line.trim().length > 0) {
                const indentMatch = line.match(/^[ \t]*/);
                if (indentMatch) {
                    minIndent = Math.min(minIndent, indentMatch[0].length);
                }
            }
        }
        if (minIndent > 0 && minIndent !== Infinity) {
            return lines.map(line => line.length >= minIndent ? line.substring(minIndent) : line).join('\n');
        }
        return cleaned;
    }

    function initPyNoteEmbeds() {
        const targets = document.querySelectorAll('pynote:not([data-initialized]), [data-add-pynote-here="true"]:not([data-initialized])');
        if (targets.length === 0) return;

        targets.forEach(target => {
            target.setAttribute('data-initialized', 'true');
            
            const initialContent = target.tagName.toLowerCase() === 'pynote' ? cleanTemplateContent(target.textContent) : '';
            target.style.display = 'none';

            const wrapper = document.createElement('div');
            wrapper.className = 'pynote-widget-mount-point';
            wrapper.style.cssText = 'position: relative; background: #f8fafc; border-radius: 4px; border: 2px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; min-height: 250px; width: 100%; margin-top: 10px; margin-bottom: 10px;';
            
            // Allow override of config via attributes
            const config = {
                showTopBar: target.getAttribute('data-show-top-bar') !== 'false',
                kernelType: target.getAttribute('data-kernel-type') || "skulpt",
                autocompleteMode: target.getAttribute('data-autocomplete-mode') || "custom",
                questionMode: target.getAttribute('data-question-mode') !== 'false',
                showShareButton: target.getAttribute('data-show-share-button') === 'true'
            };

            wrapper.innerHTML = `
                <span class="widget-placeholder" style="color: #64748b; font-family: monospace; font-weight: bold; font-size: 1.1rem;">
                    Loading PyNote...
                </span>
                <iframe style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; border: none; opacity: 0; transition: opacity 0.3s ease-in;" 
                        src="${defaultOrigin}/index.html"></iframe>
            `;

            target.parentNode.insertBefore(wrapper, target.nextSibling);

            const iframe = wrapper.querySelector('iframe');
            
            iframe.onload = () => {
                iframe.contentWindow.postMessage({
                    type: 'LOAD_CONTENT',
                    payload: {
                        content: initialContent,
                        config: Object.assign({}, config, { originalTemplate: initialContent })
                    }
                }, '*');
                
                iframe.style.opacity = '1';
                wrapper.querySelector('.widget-placeholder').style.display = 'none';
            };
        });

        if (!window.__pynoteHeightListenerAttached) {
            window.__pynoteHeightListenerAttached = true;
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'SYNC_HEIGHT') {
                    const newHeight = e.data.payload?.height;
                    if (newHeight && typeof newHeight === 'number' && newHeight >= 100) {
                        const iframes = document.querySelectorAll('.pynote-widget-mount-point iframe');
                        iframes.forEach(iframe => {
                            if (iframe.contentWindow === e.source) {
                                iframe.closest('.pynote-widget-mount-point').style.height = newHeight + 'px';
                            }
                        });
                    }
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPyNoteEmbeds);
    } else {
        initPyNoteEmbeds();
    }
})();
