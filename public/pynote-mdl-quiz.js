(function () {
  const currentScript = document.currentScript;
  let defaultOrigin = 'http://localhost:5173';
  if (currentScript && currentScript.src) {
    try {
      defaultOrigin = new URL(currentScript.src).origin;
    } catch (e) { }
  }

  // Centralized LMS Widget Manager CDN configuration
  const DEFAULT_LMS_WIDGET_MANAGER_URL = new URL('lms-widget-manager.iife.js', defaultOrigin).href;
  const lmsWidgetManagerUrl = window.LMS_WIDGET_MANAGER_URL ||
    (currentScript && (currentScript.getAttribute('data-widget-manager-url') || currentScript.getAttribute('data-manager-url'))) ||
    DEFAULT_LMS_WIDGET_MANAGER_URL;
  window.LMS_WIDGET_MANAGER_URL = lmsWidgetManagerUrl;

  function loadLMSWidgetManager() {
    if (window.LMSWidgetManager) {
      return Promise.resolve(window.LMSWidgetManager);
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lms-manager]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.LMSWidgetManager));
        existing.addEventListener('error', reject);
        return;
      }

      const script = document.createElement('script');
      script.setAttribute('data-lms-manager', 'true');
      script.src = window.LMS_WIDGET_MANAGER_URL || DEFAULT_LMS_WIDGET_MANAGER_URL;
      script.onload = () => resolve(window.LMSWidgetManager);
      script.onerror = (err) => reject(new Error('Failed to load LMSWidgetManager: ' + err));
      document.head.appendChild(script);
    });
  }
  window.loadLMSWidgetManager = loadLMSWidgetManager;

  function applyLmsIntegration(embed, textarea, height, origin, starterCode) {
    const showAnswerbox = embed.getAttribute('data-show-answerbox') === 'true';

    if (textarea && starterCode && !textarea.value) {
      textarea.value = starterCode;
    }
    if (textarea && !showAnswerbox) {
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.tabIndex = -1;
      const answerBlock = textarea.closest('.answer');
      if (answerBlock) {
        answerBlock.style.display = 'none';
      }
    }

    const container = document.createElement('div');
    container.className = 'lms-widget-container pynote-widget-mount-point';
    container.setAttribute('data-widget-origin', '*');
    container.setAttribute('data-origin', '*');
    if (textarea) {
      if (textarea.id) container.setAttribute('data-lms-target-textarea', '#' + textarea.id);
      if (textarea.name) container.setAttribute('data-lms-textarea-name', textarea.name);
    }
    
    // Set custom config attributes on the container for the LMS Widget Manager to pass down
    if (embed.hasAttribute('data-show-share-button')) container.setAttribute('data-show-share-button', embed.getAttribute('data-show-share-button'));
    if (embed.hasAttribute('data-show-top-bar')) container.setAttribute('data-show-top-bar', embed.getAttribute('data-show-top-bar'));
    
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = (height || 400) + 'px';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #e2e8f0';
    embed.appendChild(container);

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-lms-widget', 'true');
    iframe.setAttribute('width', '100%');
    iframe.setAttribute('height', height || 400);
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.outline = 'none';
    iframe.style.borderRadius = '8px';
    iframe.style.overflow = 'hidden';

    // The widget manager protocol is designed to initialize via LMS messaging,
    // so we just point it at the index.html and let the LMS widget manager do the handshake.
    iframe.src = `${origin}/index.html`;

    container.appendChild(iframe);

    // Notify LMSWidgetManager that a new container is mounted (decoupled handshake)
    container.dispatchEvent(new CustomEvent('lms-widget:mount', {
      bubbles: true,
      detail: { container: container }
    }));

    // Ensure the external LMSWidgetManager module is loaded
    loadLMSWidgetManager();
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

  function initEmbeds() {
    const embedTargets = document.querySelectorAll('pynote:not([data-initialized]), [data-add-pynote-here="true"]:not([data-initialized])');
    if (embedTargets.length === 0) return;

    let origin = defaultOrigin;
    const scriptRef = currentScript || document.currentScript;
    if (scriptRef && scriptRef.src) {
      try {
        origin = new URL(scriptRef.src).origin;
      } catch (e) { }
    }

    const embeds = [];

    embedTargets.forEach(target => {
      target.setAttribute('data-initialized', 'true');
      
      let embed = document.createElement('div');
      embed.className = 'pynote-embed-wrapper';
      embed.setAttribute('data-initialized', 'true');

      Array.from(target.attributes).forEach(attr => {
        if (attr.name !== 'data-initialized') embed.setAttribute(attr.name, attr.value);
      });
      
      const starterCode = target.tagName.toLowerCase() === 'pynote' ? cleanTemplateContent(target.textContent) : '';
      embed._starterCode = starterCode;
      
      target.parentNode.insertBefore(embed, target);
      target.style.display = 'none'; // Keep original in DOM if needed, just hide
      
      embeds.push(embed);
    });

    for (const embed of embeds) {
      const questionBlock = embed.closest('.que, .moodle-question, .formulation, form') || embed.parentElement || document;
      const textarea = questionBlock.querySelector('textarea');
      let height = embed.getAttribute('data-height');

      if (textarea && !height) {
        if (textarea.clientHeight > 50) {
          height = textarea.clientHeight + 115;
        } else {
          height = 400;
        }
      }

      applyLmsIntegration(embed, textarea, height || 400, origin, embed._starterCode);
    }

    if (!window.__pynoteHeightListenerAttached) {
      window.__pynoteHeightListenerAttached = true;
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SYNC_HEIGHT') {
          const newHeight = e.data.payload?.height || e.data.height;
          if (newHeight && typeof newHeight === 'number' && newHeight >= 100) {
            const iframes = document.querySelectorAll('iframe[data-lms-widget]');
            iframes.forEach(iframe => {
              if (iframe.contentWindow === e.source) {
                iframe.setAttribute('height', newHeight);
                const container = iframe.closest('.lms-widget-container');
                if (container) {
                  container.style.height = newHeight + 'px';
                }
              }
            });
          }
        }
      });
    }

    document.dispatchEvent(new CustomEvent('lms-widgets:init', {
      bubbles: true
    }));

    loadLMSWidgetManager();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmbeds);
  } else {
    initEmbeds();
  }
})();
