// This script will be injected into the page
// Browser API compatibility shim for Chrome and Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}

console.log("CrowdAssist content script loaded.");

// Chrome API utility functions
function safeStorageGet(keys, callback) {
  try {
    if (browser.runtime && browser.runtime.id) {
      browser.storage.sync.get(keys, function(result) {
        if (browser.runtime.lastError) {
          console.warn('CrowdAssist: Storage error:', browser.runtime.lastError);
          callback(null);
          return;
        }
        callback(result);
      });
    } else {
      console.warn('CrowdAssist: Extension context invalidated');
      callback(null);
    }
  } catch (error) {
    console.warn('CrowdAssist: Chrome API error:', error);
    callback(null);
  }
}

function safeStorageSet(items, callback) {
  try {
    if (browser.runtime && browser.runtime.id) {
      browser.storage.sync.set(items, function() {
        if (browser.runtime.lastError) {
          console.warn('CrowdAssist: Storage set error:', browser.runtime.lastError);
        }
        if (callback) callback();
      });
    } else {
      console.warn('CrowdAssist: Extension context invalidated');
    }
  } catch (error) {
    console.warn('CrowdAssist: Chrome API error:', error);
  }
}

// AI provider abstraction
const CA_AI_DEFAULTS = {
  openai:    { model: 'gpt-5.6-luna',    endpoint: 'https://api.openai.com/v1/chat/completions', label: 'OpenAI' },
  anthropic: { model: 'claude-sonnet-5', endpoint: 'https://api.anthropic.com/v1/messages',      label: 'Anthropic' }
};

async function callAI({ system, user, maxTokens, temperature }) {
  const settings = await new Promise((resolve) => {
    safeStorageGet(['ai_provider', 'openai_token', 'anthropic_token'], resolve);
  });

  const provider = (settings && settings.ai_provider) || 'openai';
  const cfg = CA_AI_DEFAULTS[provider];
  if (!cfg) throw new Error(`Unknown AI provider: ${provider}`);

  if (provider === 'anthropic') {
    const key = settings && settings.anthropic_token;
    if (!key) throw new Error('Set your Anthropic API key in the extension popup first.');

    const response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json'
      },
      // No temperature: Sonnet 5 rejects a non-default value with a 400. Tone and
      // determinism are steered from the system prompts instead.
      //
      // Thinking is disabled explicitly because Sonnet 5 runs adaptive thinking
      // when the field is omitted, and max_tokens caps thinking plus response text
      // together. These calls budget 400-1500 tokens, so a thinking pass would
      // truncate the reply.
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    if (!response.ok) {
      let msg = `Anthropic API error (${response.status})`;
      try {
        const err = await response.json();
        if (err && err.error && err.error.message) msg = `Anthropic: ${err.error.message}`;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await response.json();
    const block = data && data.content && data.content.find(c => c.type === 'text');
    if (!block || !block.text) throw new Error('Anthropic returned an empty response.');
    return block.text;
  }

  // Default: OpenAI
  const key = settings && settings.openai_token;
  if (!key) throw new Error('Set your OpenAI API key in the extension popup first.');

  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    let msg = `OpenAI API error (${response.status})`;
    try {
      const err = await response.json();
      if (err && err.error && err.error.message) msg = `OpenAI: ${err.error.message}`;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('OpenAI returned an empty response.');
  return text;
}

// Theme utility functions
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getCurrentTheme(callback) {
  safeStorageGet(['theme_mode'], function(result) {
    if (!result) {
      callback('light');
      return;
    }
    
    const themeMode = result.theme_mode || 'system';
    let actualTheme;
    
    if (themeMode === 'system') {
      actualTheme = getSystemTheme();
    } else {
      actualTheme = themeMode;
    }
    
    callback(actualTheme);
  });
}

function getThemeStyles(theme) {
  if (theme === 'dark') {
    return {
      background: '#1b1f24',
      color: '#e2e8f0',
      inputBackground: '#2d3748',
      inputBorder: '#4a5568',
      buttonBackground: '#FF6900',
      buttonSecondaryBackground: '#2d3748',
      buttonSecondaryColor: '#e2e8f0',
      codeBackground: '#0f1419'
    };
  } else {
    return {
      background: 'white',
      color: '#333',
      inputBackground: 'white',
      inputBorder: '#ddd',
      buttonBackground: '#FF6900',
      buttonSecondaryBackground: 'white',
      buttonSecondaryColor: '#333',
      codeBackground: '#f8f9fa'
    };
  }
}

// Toolbar icon SVG path data
const CA_ICONS = {
  globe: '<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm5.9 7H11c-.1-2.2-.8-4.2-1.8-5.5A6.5 6.5 0 0 1 13.9 7zM8 14.5c-1.3 0-2.7-2.4-2.9-5.5h5.8c-.2 3.1-1.6 5.5-2.9 5.5zM5.1 7C5.3 3.9 6.7 1.5 8 1.5S10.7 3.9 10.9 7H5.1zM6.8 1.5C5.8 2.8 5.1 4.8 5 7H2.1A6.5 6.5 0 0 1 6.8 1.5zM2.1 9H5c.1 2.2.8 4.2 1.8 5.5A6.5 6.5 0 0 1 2.1 9zm7.1 5.5c1-1.3 1.7-3.3 1.8-5.5h2.9a6.5 6.5 0 0 1-4.7 5.5z"/>',
  sparkle: '<path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.829l.645-1.936zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.5.845 1.018 1.018l1.162.387a.217.217 0 0 1 0 .412l-1.162.387c-.518.173-.845.5-1.018 1.018l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162c-.173-.518-.5-.845-1.018-1.018L1.227 3.127a.217.217 0 0 1 0-.412l1.162-.387c.518-.173.845-.5 1.018-1.018l.387-1.162z"/>',
  chat: '<path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5a.5.5 0 0 0-.354.146L8 14.293V11.5a.5.5 0 0 0-.5-.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h5v3.5a.5.5 0 0 0 .854.354L11.207 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>',
  clipboard: '<path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>',
  docSparkle: '<path d="M9.293 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0zM9.5 3.5v-2l3 3h-2a1 1 0 0 1-1-1z"/><path d="M5.5 7a.5.5 0 0 1 .5.5v1.5H7.5a.5.5 0 0 1 0 1H6V11.5a.5.5 0 0 1-1 0V10H3.5a.5.5 0 0 1 0-1H5V7.5a.5.5 0 0 1 .5-.5z"/>',
  format: '<path d="M12 12a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1h-1.388q0-.527.062-1.054.093-.558.31-.992t.559-.683q.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 9 7.558V11a1 1 0 0 0 1 1zm-6 0a1 1 0 0 0 1-1V8.558a1 1 0 0 0-1-1H4.612q0-.527.062-1.054.094-.558.31-.992.217-.434.559-.683.34-.279.868-.279V3q-.868 0-1.52.372a3.3 3.3 0 0 0-1.085.992 4.9 4.9 0 0 0-.62 1.458A7.7 7.7 0 0 0 3 7.558V11a1 1 0 0 0 1 1z"/>',
  eyeSlash: '<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>'
};

// Toolbar helper functions
function applyToolbarTheme(container) {
  getCurrentTheme((theme) => { container.setAttribute('data-ca-theme', theme); });
}

function createToolbarIcon(pathData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ca-toolbar__icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.innerHTML = pathData;
  return svg;
}

function createToolbarButton(id, label, iconPathData) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'ca-toolbar__btn';
  btn.type = 'button';
  if (iconPathData) btn.appendChild(createToolbarIcon(iconPathData));
  const textSpan = document.createElement('span');
  textSpan.className = 'ca-toolbar__btn-text';
  textSpan.textContent = label;
  btn.appendChild(textSpan);
  return btn;
}

function setButtonLoading(btn, loadingText) {
  btn.disabled = true;
  const textSpan = btn.querySelector('.ca-toolbar__btn-text');
  if (textSpan) { textSpan.dataset.originalText = textSpan.textContent; textSpan.textContent = loadingText; }
}

function setButtonReady(btn) {
  btn.disabled = false;
  const textSpan = btn.querySelector('.ca-toolbar__btn-text');
  if (textSpan && textSpan.dataset.originalText) { textSpan.textContent = textSpan.dataset.originalText; delete textSpan.dataset.originalText; }
}

// Modal utility functions
function createModal(content, buttons = [], callback) {
  getCurrentTheme((theme) => {
    const styles = getThemeStyles(theme);
    
    // Remove existing modal if any
    const existingModal = document.getElementById('ca-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'ca-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: ${styles.background};
      color: ${styles.color};
      border-radius: 8px;
      padding: 24px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = content;

    // Update input and textarea styles for theme
    const inputs = modal.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.style.background = styles.inputBackground;
      input.style.color = styles.color;
      input.style.borderColor = styles.inputBorder;
    });

    // Update code/pre elements for theme
    const codeElements = modal.querySelectorAll('div[style*="background"]');
    codeElements.forEach(element => {
      if (element.style.background.includes('#f8f9fa') || element.style.background.includes('#1a202c')) {
        element.style.background = styles.codeBackground;
      }
    });

    // Add buttons
    if (buttons.length > 0) {
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
      `;

      buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.textContent = button.text;
        btn.style.cssText = `
          padding: 8px 16px;
          border: 1px solid ${styles.inputBorder};
          border-radius: 4px;
          background: ${button.primary ? styles.buttonBackground : styles.buttonSecondaryBackground};
          color: ${button.primary ? 'white' : styles.buttonSecondaryColor};
          cursor: pointer;
          font-size: 14px;
        `;
        btn.onclick = () => {
          button.onClick();
          closeModal();
        };
        buttonContainer.appendChild(btn);
      });

      modal.appendChild(buttonContainer);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    if (callback) callback(modal);
  });
}

function closeModal() {
  const modal = document.getElementById('ca-modal-overlay');
  if (modal) {
    modal.remove();
  }
}

function showInputModal(title, inputs, onSubmit) {
  getCurrentTheme((theme) => {
    const styles = getThemeStyles(theme);
    
    let formHTML = `<h3 style="margin: 0 0 20px 0; color: ${styles.color};">${title}</h3>`;
    
    inputs.forEach(input => {
      formHTML += `
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: ${styles.color};">
            ${input.label}
          </label>
          <input 
            type="text" 
            id="${input.id}" 
            placeholder="${input.placeholder || ''}"
            style="width: 100%; padding: 8px 12px; border: 1px solid ${styles.inputBorder}; border-radius: 4px; font-size: 14px; box-sizing: border-box; background: ${styles.inputBackground}; color: ${styles.color};"
          />
          ${input.helpText ? `<div style="font-size: 11px; color: ${styles.color}; opacity: 0.7; margin-top: 4px;">${input.helpText}</div>` : ''}
        </div>
      `;
    });

    createModal(formHTML, [
      {
        text: 'Cancel',
        onClick: () => {}
      },
      {
        text: 'Generate',
        primary: true,
        onClick: () => {
          const values = {};
          inputs.forEach(input => {
            values[input.id] = document.getElementById(input.id).value.trim();
          });
          
          // Validate inputs
          const hasEmpty = Object.values(values).some(value => !value);
          if (hasEmpty) {
            alert('Please fill in all fields');
            return;
          }
          
          onSubmit(values);
        }
      }
    ], (modal) => {
      // Focus first input
      setTimeout(() => {
        const firstInput = modal.querySelector('input');
        if (firstInput) firstInput.focus();
      }, 100);
    });
  });
}

function showResultModal(title, content, onConfirm, buttonText = 'Use This Report') {
  getCurrentTheme((theme) => {
    const styles = getThemeStyles(theme);
    
    // Clean up content by trimming extra whitespace
    const cleanContent = content.trim();
    
    const resultHTML = `<h3 style="margin: 0 0 20px 0; color: ${styles.color};">${title}</h3><div style="background: ${styles.codeBackground}; padding: 16px; border-radius: 4px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.5; color: ${styles.color};">${cleanContent}</div>`;

    createModal(resultHTML, [
      {
        text: 'Cancel',
        onClick: () => {}
      },
      {
        text: buttonText,
        primary: true,
        onClick: onConfirm
      }
    ]);
  });
}

// Check if we're on a report creation page (not visualization)
function isReportCreationPage() {
  const url = window.location.href;
  return url.includes('/engagements/') && (url.includes('/submissions/new') || (url.includes('/submissions/') && url.includes('/edit')));
}

// Check if we're on a report visualization page
function isReportVisualizationPage() {
  const url = window.location.href;
  // Pattern: /submissions/UUID (without /engagements/ and without /edit)
  return url.match(/\/submissions\/[a-f0-9\-]{36}$/) && !url.includes('/engagements/');
}

// Right-hand sidebar column on the submissions list page (the "bounties" panel)
const HIDE_BOUNTIES_SELECTOR = '#content > main > div > div > div.container.bc-mt-4 > section > div > div.row > div.col-md-4.col-md-push-8.col-xl-3.col-xl-push-9';

// Check if we're on the submissions LIST page: exactly /submissions or /submissions/
// (not /submissions/<uuid> detail pages, not /engagements/.../submissions)
function isSubmissionsListPage() {
  return /^\/submissions\/?$/.test(window.location.pathname);
}

// Writes a value the way React will notice. Going through the prototype setter
// bypasses React's own value tracker, so the tracker's cached value stays stale and
// the dispatched input event registers as a real change.
//
// Both descriptor lookups must be guarded. React installs its own "value" property on
// the node, but that lives in the page world — from the extension's isolated world
// there is no own descriptor and the lookup returns undefined. Dereferencing .set on
// it is what used to throw on every click.
function setNativeValue(element, value) {
  const ownSetter = (Object.getOwnPropertyDescriptor(element, 'value') || {}).set;
  const prototypeSetter = (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value') || {}).set;

  if (prototypeSetter && ownSetter !== prototypeSetter) {
    prototypeSetter.call(element, value);
  } else if (ownSetter) {
    ownSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function getUsernames() {
  return [...new Set(
    Array.from(
      document.querySelectorAll('span.owner-name[data-tooltip-id]'),
      el => el.textContent.trim()
    ).filter(name => name && !/\s/.test(name)) // drop empty + names w/ spaces
  )];
}

let tooltip = null;
let activeAtIndex = -1;

function showTooltip(usernames, rect, atIndex) {
  if (tooltip) {
    tooltip.remove();
  }
  activeAtIndex = atIndex;

  tooltip = document.createElement('ul');
  tooltip.className = 'username-tooltip';

  usernames.forEach(username => {
    const li = document.createElement('li');
    li.textContent = username;
    li.addEventListener('click', () => {
      const commentBox = document.querySelector('#create-comment-body');
      if (!commentBox) { return; }

      const text = commentBox.value;
      if (activeAtIndex === -1) { hideTooltip(); return; }

      const query = text.substring(activeAtIndex + 1).split(' ')[0];
      const textToInsert = username + ' ';

      commentBox.focus();
      commentBox.setSelectionRange(activeAtIndex + 1, activeAtIndex + 1 + query.length);
      document.execCommand('insertText', false, textToInsert);

      hideTooltip();
    });
    tooltip.appendChild(li);
  });

  document.body.appendChild(tooltip);
  const top = rect.top + window.scrollY - tooltip.offsetHeight;
  const left = rect.left + window.scrollX;
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function hideTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
    activeAtIndex = -1;
  }
}

function updateTooltipState(commentBox) {
  if (!commentBox) {
    hideTooltip();
    return;
  }

  const text = commentBox.value;
  const cursorPosition = commentBox.selectionStart;
  const textBeforeCursor = text.substring(0, cursorPosition);
  const atIndex = textBeforeCursor.lastIndexOf('@');

  if (atIndex === -1) {
    hideTooltip();
    return;
  }

  const potentialMention = textBeforeCursor.substring(atIndex);
  if (/\s/.test(potentialMention)) {
    hideTooltip();
    return;
  }

  const query = potentialMention.substring(1);
  const usernames = getUsernames();

  if (usernames.length > 3 && query === '') {
    hideTooltip();
    return;
  }

  const filteredUsernames = usernames.filter(u => u.toLowerCase().startsWith(query.toLowerCase()));

  if (filteredUsernames.length > 0) {
    const rect = commentBox.getBoundingClientRect();
    showTooltip(filteredUsernames, rect, atIndex);
  } else {
    hideTooltip();
  }
}

function loadTurndown(callback) {
  if (window.TurndownService) {
    callback();
    return;
  }
  
  try {
    if (browser.runtime && browser.runtime.id) {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('turndown.js');
      script.onload = callback;
      script.onerror = () => {
        console.error('CrowdAssist: Failed to load turndown.js');
        callback();
      };
      document.head.appendChild(script);
    } else {
      console.warn('CrowdAssist: Extension context invalidated, cannot load turndown.js');
      callback();
    }
  } catch (error) {
    console.warn('CrowdAssist: Error loading turndown.js:', error);
    callback();
  }
}

function copyReportAsMarkdown() {
  const button = document.getElementById('ca-copy-markdown-button');
  const textSpan = button.querySelector('.ca-toolbar__btn-text');
  const originalText = textSpan.textContent;

  const turndownService = new TurndownService();
  const submissionElement = document.querySelector('.bc-helper-nopadding');

  if (submissionElement) {
    // Clone the element and remove the feature container from the clone to prevent it from being copied
    const submissionClone = submissionElement.cloneNode(true);
    const featureContainerInClone = submissionClone.querySelector('#ca-copy-feature-container');
    if (featureContainerInClone) {
      featureContainerInClone.remove();
    }

    const markdown = turndownService.turndown(submissionClone);
    navigator.clipboard.writeText(markdown).then(() => {
      textSpan.textContent = 'Copied!';
      setTimeout(() => { textSpan.textContent = originalText; }, 2000);
    }).catch(err => {
      console.error('CrowdAssist: Failed to copy text: ', err);
      textSpan.textContent = 'Error!';
      setTimeout(() => { textSpan.textContent = originalText; }, 2000);
    });
  } else {
    console.error('CrowdAssist: Could not find submission content element.');
  }
}

function addCopyButton() {
  const targetArea = document.querySelector('#researcher-submission > div.row > div.col-md-9.col-md-pull-3 > div > ul > li > ul > li:nth-child(8) > div.col-md-9 > div');

  // Prevent duplicate additions
  if (targetArea && !document.getElementById('ca-copy-feature-container')) {
    const featureContainer = document.createElement('div');
    featureContainer.id = 'ca-copy-feature-container';
    featureContainer.className = 'ca-toolbar ca-toolbar--bordered';
    featureContainer.style.marginBottom = '5px';

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist';
    label.className = 'ca-toolbar__label';
    featureContainer.appendChild(label);

    const divider = document.createElement('div');
    divider.className = 'ca-toolbar__divider';
    featureContainer.appendChild(divider);

    const copyButton = createToolbarButton('ca-copy-markdown-button', 'Copy as Markdown', CA_ICONS.clipboard);
    copyButton.addEventListener('click', copyReportAsMarkdown);
    featureContainer.appendChild(copyButton);

    applyToolbarTheme(featureContainer);
    targetArea.prepend(featureContainer);
  }
}

// Reads the server-rendered props for the submission page. Bugcrowd mounts it from
// <div data-react-class="ResearcherSubmission" data-react-props="{...}"> and leaves
// the attribute in place after mounting, so it stays readable from here.
function getSubmissionProps() {
  const root = document.querySelector('[data-react-class="ResearcherSubmission"]');
  if (!root) {
    return null;
  }
  try {
    return JSON.parse(root.getAttribute('data-react-props'));
  } catch (error) {
    console.warn('CrowdAssist: could not parse submission props', error);
    return null;
  }
}

// Returns the oldest activity of the given key. Activities come back newest-first
// within a page, so on a paginated feed the oldest ones sit on the last page.
async function fetchOldestActivity(feedUrl, key) {
  const getPage = (page) => fetch(`${feedUrl}?page=${page}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).then((response) => response.json());

  const firstPage = await getPage(1);
  const totalPages = firstPage.paginationMeta && firstPage.paginationMeta.totalPages;
  const page = totalPages > 1 ? await getPage(totalPages) : firstPage;

  const matches = (page.activities || []).filter((activity) => activity.key === key);
  return matches.length ? matches[matches.length - 1] : null;
}

function formatDuration(diffMs) {
  const minutes = Math.floor(Math.max(0, diffMs) / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

// init() re-runs on every DOM mutation, so remember what we already resolved rather
// than re-fetching the feed dozens of times per page. Cleared to null on failures so
// a transient error gets retried.
let triageIndicatorState = null; // { submissionId, status: 'pending'|'done'|'none', text, title }

function insertTriageIndicator(text, title) {
  const anchor = document.querySelector('#researcher-submission > div.row > div.col-md-3.col-md-push-9 > div:nth-child(1) > p:nth-child(2) > span');
  if (!anchor || document.getElementById('ca-triage-time-indicator')) {
    return;
  }

  const indicator = document.createElement('div');
  indicator.id = 'ca-triage-time-indicator';
  indicator.textContent = text;
  indicator.title = title;
  indicator.style.marginTop = '4px';
  indicator.style.fontSize = '12px';
  indicator.style.color = '#6b7280';

  anchor.insertAdjacentElement('afterend', indicator);
}

// Show how long triage took: submission through to the first state transition.
// Keying off the transition rather than the "Triaged" badge covers every decided
// submission — plenty go straight to Unresolved / Not Applicable / Informational and
// never pass through Triaged at all. No transition means it is still New, so nothing
// is shown.
async function addTriagedTimeIndicator() {
  // Clean up the container id used by an earlier implementation
  const oldExisting = document.getElementById('ca-triage-time-container');
  if (oldExisting) {
    oldExisting.remove();
  }

  const props = getSubmissionProps();
  const submission = props && props.submissionDetailProps && props.submissionDetailProps.submission;
  const submissionId = submission && submission.id;
  if (!submissionId || !props.activityFeedUrl) {
    return;
  }

  if (triageIndicatorState && triageIndicatorState.submissionId === submissionId) {
    // Already resolved for this submission. Re-insert if a re-render dropped the node.
    if (triageIndicatorState.status === 'done') {
      insertTriageIndicator(triageIndicatorState.text, triageIndicatorState.title);
    }
    return;
  }

  // Claim this submission synchronously, before the first await.
  triageIndicatorState = { submissionId, status: 'pending' };

  const submittedTimeEl = document.querySelector('#researcher-submission > div.row > div.col-md-9.col-md-pull-3 > div > ul > li > ul > li:nth-child(2) > div.col-md-9.cc-tabular-nums > time');
  const submittedStr = submission.submitted_at || (submittedTimeEl && submittedTimeEl.getAttribute('datetime'));
  const submittedDate = submittedStr ? new Date(submittedStr) : null;
  if (!submittedDate || isNaN(submittedDate.getTime())) {
    triageIndicatorState = null;
    return;
  }

  let transition;
  try {
    transition = await fetchOldestActivity(props.activityFeedUrl, 'submission.transitioned');
  } catch (error) {
    console.warn('CrowdAssist: could not load the activity feed', error);
    triageIndicatorState = null;
    return;
  }

  if (!transition) {
    // Still New — triage has not made a decision yet.
    triageIndicatorState = { submissionId, status: 'none' };
    return;
  }

  const triageDate = new Date(transition.created_at);
  if (isNaN(triageDate.getTime())) {
    triageIndicatorState = null;
    return;
  }

  const outcome = transition.params && transition.params.substate;
  const text = `Triaged in ${formatDuration(triageDate.getTime() - submittedDate.getTime())}`;
  const title = `Submitted: ${submittedDate.toString()}\nTriaged: ${triageDate.toString()}`
    + (outcome ? `\nOutcome: ${outcome}` : '');

  triageIndicatorState = { submissionId, status: 'done', text, title };
  insertTriageIndicator(text, title);
}

function addIncludeIpButton() {
  const referenceElement = document.querySelector('#reply-form > div > div > div:nth-child(3)');

  if (referenceElement && !document.getElementById('ca-ip-feature-container')) {
    const featureContainer = document.createElement('div');
    featureContainer.id = 'ca-ip-feature-container';
    featureContainer.className = 'ca-toolbar';

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist';
    label.className = 'ca-toolbar__label';
    featureContainer.appendChild(label);

    const divider = document.createElement('div');
    divider.className = 'ca-toolbar__divider';
    featureContainer.appendChild(divider);

    const ipButton = createToolbarButton('ca-include-ip-button', 'Include My IP', CA_ICONS.globe);

    ipButton.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const ip = data.ip;

        const commentBox = document.querySelector('#create-comment-body');
        if (commentBox) {
          const textToInsert = `My IP is: ${ip}`;
          const newText = commentBox.value ? `${commentBox.value}\n\n${textToInsert}` : textToInsert;

          commentBox.value = newText;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (error) {
        console.error('CrowdAssist: Failed to fetch IP address.', error);
      }
    });

    featureContainer.appendChild(ipButton);
    applyToolbarTheme(featureContainer);
    referenceElement.insertAdjacentElement('afterend', featureContainer);
  }
}

// Bugcrowd embeds an image as `![name](url "name")` and any other attachment as
// `[name](url "name")` — the leading "!" is the only difference, so keying on it is
// what keeps PDFs and logs from being quoted too. Filenames are encodeURI'd, which
// leaves parentheses intact ("Screenshot (1).png"), so match on the ends of the line
// rather than trying to parse the URL.
function isImageLine(line) {
  return line.startsWith('![') && line.endsWith(')');
}

// Bugcrowd's report standard wants image embeds prefixed with "> ". Lines that are
// already quoted are left alone, which makes this safe to run repeatedly. Content
// inside fenced code blocks is skipped — reports routinely paste raw markdown, HTTP
// requests and payloads in fences, where the text is literal and must not be rewritten.
function quoteImageLines(text) {
  let count = 0;
  let inFence = false;

  const lines = text.split('\n').map((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      return line;
    }

    if (inFence || !trimmed || trimmed.startsWith('>') || !isImageLine(trimmed)) {
      return line;
    }

    count++;
    return `> ${trimmed}`;
  });

  return { text: lines.join('\n'), count };
}

function flashButtonLabel(btn, message) {
  const textSpan = btn.querySelector('.ca-toolbar__btn-text');
  if (!textSpan || textSpan.dataset.caFlashing) return;

  const original = textSpan.textContent;
  textSpan.dataset.caFlashing = 'true';
  textSpan.textContent = message;
  setTimeout(() => {
    textSpan.textContent = original;
    delete textSpan.dataset.caFlashing;
  }, 1600);
}

// Report standardisation rules Bugcrowd asks for. Each takes the editor text and
// returns { text, count }, so adding a rule is one entry here.
const CA_FORMAT_RULES = [
  { name: 'quote-images', apply: quoteImageLines }
];

function applyFormatRules(text) {
  return CA_FORMAT_RULES.reduce((acc, rule) => {
    const result = rule.apply(acc.text);
    return { text: result.text, count: acc.count + result.count };
  }, { text, count: 0 });
}

// The editor is a React-controlled textarea, so the value has to go through
// setNativeValue for React's onChange to see it. Assigning .value directly (as the
// older insertion paths do) can leave React holding the pre-click text, which would
// silently send the unformatted version when the user clicks straight through to Send.
function fixFormattingIn(textarea, btn) {
  if (!textarea) {
    flashButtonLabel(btn, 'No editor found');
    return;
  }

  const { text, count } = applyFormatRules(textarea.value || '');
  if (count === 0) {
    flashButtonLabel(btn, 'Nothing to fix');
    return;
  }

  setNativeValue(textarea, text);
  flashButtonLabel(btn, count === 1 ? '1 fix applied' : `${count} fixes applied`);
}

function getReportDescriptionField() {
  return document.querySelector('#submission_description') ||
         document.querySelector('textarea[name="description"]') ||
         document.querySelector('textarea[placeholder*="description"]') ||
         document.querySelector('textarea');
}

function addFixFormattingButton() {
  const ipFeatureContainer = document.getElementById('ca-ip-feature-container');

  if (ipFeatureContainer && !document.getElementById('ca-fix-formatting-button')) {
    const formatButton = createToolbarButton('ca-fix-formatting-button', 'Fix Formatting', CA_ICONS.format);

    formatButton.addEventListener('click', (event) => {
      event.preventDefault();
      fixFormattingIn(document.querySelector('#create-comment-body'), formatButton);
    });

    ipFeatureContainer.appendChild(formatButton);
  }
}

function addAiReviewButton() {
  const ipFeatureContainer = document.getElementById('ca-ip-feature-container');

  if (ipFeatureContainer && !document.getElementById('ca-ai-review-button')) {
    const aiButton = createToolbarButton('ca-ai-review-button', 'AI Review Text', CA_ICONS.sparkle);

    aiButton.addEventListener('click', async (event) => {
      event.preventDefault();

      const commentBox = document.querySelector('#create-comment-body');
      if (!commentBox || !commentBox.value.trim()) {
        alert('Please write some text in the comment box first.');
        return;
      }

      setButtonLoading(aiButton, 'Reviewing...');

      try {
        // Get the last comment for context
        const commentElements = document.querySelectorAll('div > div.activity-block__content > div.bc-markdown.bc-markdown--image-with-cursor.bc-markdown--bordered');
        let lastComment = '';
        if (commentElements.length > 0) {
          lastComment = commentElements[commentElements.length - 1].textContent.trim();
        }

        const systemPrompt = 'You polish a bug bounty researcher\'s reply to a program/triage team comment on Bugcrowd. Fix only grammar, spelling, and awkward phrasing. Preserve the researcher\'s voice, tone, length, and markdown exactly — fenced code blocks, inline code, links, lists, and HTTP request/response snippets must remain byte-for-byte identical. Do not add new facts, promises, timelines, apologies, or politeness filler. Do not restructure sections. Return only the revised reply, with no preamble or explanation.';

        const userMessage = lastComment
          ? `PROGRAM COMMENT:\n"""\n${lastComment}\n"""\n\nMY DRAFT:\n"""\n${commentBox.value}\n"""\n\nReturn the polished draft.`
          : `MY DRAFT:\n"""\n${commentBox.value}\n"""\n\nReturn the polished draft.`;

        const review = await callAI({
          system: systemPrompt,
          user: userMessage,
          maxTokens: 500,
          temperature: 0.2
        });

        // Show the improved text using modal
        showResultModal('AI Improved Text', review, () => {
          commentBox.value = review;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        });

      } catch (error) {
        console.error('CrowdAssist: Failed to review text:', error);
        alert(`Failed to review text: ${error.message}`);
      } finally {
        setButtonReady(aiButton);
      }
    });

    ipFeatureContainer.appendChild(aiButton);
  }
}

function addAutoReplyButton() {
  const ipFeatureContainer = document.getElementById('ca-ip-feature-container');

  if (ipFeatureContainer && !document.getElementById('ca-auto-reply-button')) {
    const autoReplyButton = createToolbarButton('ca-auto-reply-button', 'Auto-Reply', CA_ICONS.chat);

    autoReplyButton.addEventListener('click', async (event) => {
      event.preventDefault();

      setButtonLoading(autoReplyButton, 'Generating...');

      try {
        // Get the last comment for context
        const commentElements = document.querySelectorAll('div > div.activity-block__content > div.bc-markdown.bc-markdown--image-with-cursor.bc-markdown--bordered');
        let lastComment = '';
        if (commentElements.length > 0) {
          lastComment = commentElements[commentElements.length - 1].textContent.trim();
        }

        if (!lastComment) {
          alert('No previous comment found to reply to.');
          return;
        }

        const systemPrompt = 'You draft a short reply that a bug bounty researcher will send to a program/triage team comment on Bugcrowd. Match the register of the incoming comment — terse in, terse out; detailed in, detailed out. Acknowledge concretely what was said, answer any direct question only if the answer is obvious from the comment itself, and otherwise ask the minimum clarifying question. Never invent technical facts, exploit details, payloads, timelines, or commitments. Do not apologize gratuitously. Write in first person as the researcher. Return only the reply text, no preamble, no sign-off unless the program used one.';

        const userMessage = `PROGRAM COMMENT:\n"""\n${lastComment}\n"""\n\nDraft my reply.`;

        const autoReply = await callAI({
          system: systemPrompt,
          user: userMessage,
          maxTokens: 400,
          temperature: 0.3
        });

        // Show the generated reply using modal
        showResultModal('AI Generated Reply', autoReply, () => {
          const commentBox = document.querySelector('#create-comment-body');
          if (commentBox) {
            commentBox.value = autoReply;
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            alert('Could not find comment box to insert the reply.');
          }
        }, 'Use This Reply');

      } catch (error) {
        console.error('CrowdAssist: Failed to generate auto-reply:', error);
        alert(`Failed to generate auto-reply: ${error.message}`);
      } finally {
        setButtonReady(autoReplyButton);
      }
    });

    ipFeatureContainer.appendChild(autoReplyButton);
  }
}

function addReportCreationButtons() {
  // Only add buttons on report creation pages
  if (!isReportCreationPage()) {
    return;
  }

  // Find the panel-footer element inside markdown-field
  let panelFooter = document.querySelector('div.markdown-field div.panel-footer.bc-py-1');

  // Fallback: try without the markdown-field prefix
  if (!panelFooter) {
    panelFooter = document.querySelector('div.panel-footer.bc-py-1');
  }

  if (panelFooter && !document.getElementById('ca-report-creation-feature-container')) {
    const featureContainer = document.createElement('div');
    featureContainer.id = 'ca-report-creation-feature-container';
    featureContainer.className = 'ca-toolbar ca-toolbar--bordered';

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist';
    label.className = 'ca-toolbar__label';
    featureContainer.appendChild(label);

    const divider = document.createElement('div');
    divider.className = 'ca-toolbar__divider';
    featureContainer.appendChild(divider);

    // Include My IP button
    const ipButton = createToolbarButton('ca-report-creation-include-ip-button', 'Include My IP', CA_ICONS.globe);

    ipButton.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const ip = data.ip;

        // Try different possible selectors for the description field
        const descriptionField = document.querySelector('#submission_description') ||
                                 document.querySelector('textarea[name="description"]') ||
                                 document.querySelector('textarea[placeholder*="description"]') ||
                                 document.querySelector('textarea');

        if (descriptionField) {
          const textToInsert = `My IP is: ${ip}`;
          const newText = descriptionField.value ? `${descriptionField.value}\n\n${textToInsert}` : textToInsert;

          descriptionField.value = newText;
          descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          console.error('CrowdAssist: Could not find description field');
        }
      } catch (error) {
        console.error('CrowdAssist: Failed to fetch IP address.', error);
      }
    });

    // AI Review Report button
    const aiReviewButton = createToolbarButton('ca-report-creation-ai-review-button', 'AI Review Report', CA_ICONS.sparkle);

    aiReviewButton.addEventListener('click', async (event) => {
      event.preventDefault();

      const descriptionField = document.querySelector('#submission_description') ||
                               document.querySelector('textarea[name="description"]') ||
                               document.querySelector('textarea[placeholder*="description"]') ||
                               document.querySelector('textarea');

      if (!descriptionField || !descriptionField.value.trim()) {
        alert('Please write your report in the description field first.');
        return;
      }

      setButtonLoading(aiReviewButton, 'Reviewing...');

      try {
        const systemPrompt = 'You edit a bug bounty vulnerability report written by the researcher. Preserve every technical fact, URL, payload, parameter name, HTTP request/response block, code block, command, and image/screenshot reference byte-for-byte. Improve only: grammar, spelling, sentence clarity, consistency of tone, and section ordering if it is obviously broken. Do not add impact claims, CVSS scores, CWE or VRT categories, CVE IDs, or remediation guidance the researcher did not already include. Keep all markdown formatting intact (headings, lists, fenced code, links, bold). Roughly preserve the original length. Return only the edited report in markdown, with no preamble, no explanation, and no wrapping code fence around the whole response.';

        const userMessage = `REPORT:\n<<<\n${descriptionField.value}\n>>>\n\nReturn the edited report.`;

        const improvedReport = await callAI({
          system: systemPrompt,
          user: userMessage,
          maxTokens: 1500,
          temperature: 0.2
        });

        // Show the improved report using modal
        showResultModal('AI Improved Report', improvedReport, () => {
          descriptionField.value = improvedReport;
          descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        });

      } catch (error) {
        console.error('CrowdAssist: Failed to review report:', error);
        alert(`Failed to review report: ${error.message}`);
      } finally {
        setButtonReady(aiReviewButton);
      }
    });

    // AI Generate Report button
    const aiGenerateButton = createToolbarButton('ca-report-creation-ai-generate-button', 'AI Generate Report', CA_ICONS.docSparkle);

    aiGenerateButton.addEventListener('click', async (event) => {
      event.preventDefault();

      // Show input modal for URL and vulnerability type
      showInputModal('Generate Vulnerability Report', [
        {
          id: 'targetUrl',
          label: 'Target URL',
          placeholder: 'https://example.com/vulnerable-page'
        },
        {
          id: 'vulnType',
          label: 'Vulnerability Type',
          placeholder: 'e.g., Reflected XSS, Stored XSS, SQL Injection, CSRF, etc.',
          helpText: 'Be specific for better reports! Example: "Reflected XSS" is better than "XSS"'
        }
      ], async (values) => {
        const { targetUrl, vulnType } = values;

        setButtonLoading(aiGenerateButton, 'Generating...');

        try {
          const systemPrompt = 'You draft a bug bounty vulnerability report skeleton for a researcher to complete before submitting to a Bugcrowd program. This is a DRAFT: wherever you would need to guess a specific fact (exact payload output, screenshot, affected parameter, authenticated vs unauthenticated, exact response body, HTTP status), write the placeholder `[verify]` instead of inventing it. Never fabricate CVE IDs, dates, logs, CVSS scores, or evidence the researcher did not provide. Use concise technical prose — no marketing language, no compliance/legal framing, no dates or timestamps. Output markdown only. Do not wrap the whole response in a code fence and do not include any preamble or trailing explanation.';

          const userMessage = `Generate a report draft for the following finding. Preserve the full target URL including any query parameters.

TARGET URL: ${targetUrl}
VULNERABILITY TYPE: ${vulnType}

Produce exactly these sections, in this order, in markdown:

## Summary
One short paragraph describing the vulnerability at the target. Name the affected parameter/endpoint if it is evident from the URL.

## Affected Component
- URL: the target URL
- Parameter(s): if evident from the URL, list them; otherwise write \`[verify]\`
- Authentication required: \`[verify]\`

## Steps to Reproduce
A numbered list. Each item is one discrete action a triager can perform. Use fenced code blocks for any request, payload, or URL. Use \`[verify]\` for the exact payload string unless it is canonical for this vulnerability class.

## Proof of Concept
A fenced code block containing a minimal HTTP request or curl command demonstrating the issue, with \`[verify]\` for any value that must be confirmed.

## Impact
2–4 sentences, plain language, describing what an attacker can realistically achieve. No compliance/legal framing. No generic severity adjectives without justification.

## Suggested Remediation
2–4 actionable bullets tailored to the vulnerability class.

## References
- Likely VRT category: \`[verify]\`
- Likely CWE: \`[verify]\`
- OWASP reference: \`[verify]\` (include a URL only if it is a well-known canonical OWASP page for this class)

Return only the markdown above, populated.`;

          const generatedReport = await callAI({
            system: systemPrompt,
            user: userMessage,
            maxTokens: 1200,
            temperature: 0.4
          });

          // Show result modal with the generated report
          showResultModal('Generated Vulnerability Report', generatedReport, () => {
            // Find the description field and insert the generated report
            const descriptionField = document.querySelector('#submission_description') ||
                                     document.querySelector('textarea[name="description"]') ||
                                     document.querySelector('textarea[placeholder*="description"]') ||
                                     document.querySelector('textarea');

            if (descriptionField) {
              descriptionField.value = generatedReport;
              descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              alert('Could not find description field to insert the report.');
            }
          });

        } catch (error) {
          console.error('CrowdAssist: Failed to generate report:', error);
          alert(`Failed to generate report: ${error.message}`);
        } finally {
          setButtonReady(aiGenerateButton);
        }
      });
    });

    // Fix Formatting button
    const formatButton = createToolbarButton('ca-report-creation-fix-formatting-button', 'Fix Formatting', CA_ICONS.format);

    formatButton.addEventListener('click', (event) => {
      event.preventDefault();
      fixFormattingIn(getReportDescriptionField(), formatButton);
    });

    featureContainer.appendChild(ipButton);
    featureContainer.appendChild(formatButton);
    featureContainer.appendChild(aiReviewButton);
    featureContainer.appendChild(aiGenerateButton);

    applyToolbarTheme(featureContainer);
    // Insert after the panel-footer element
    panelFooter.insertAdjacentElement('afterend', featureContainer);
  }
}

function applyPrivacyMode() {
  safeStorageGet(['privacy_mode'], function(result) {
    if (!result) return;
    
    if (result.privacy_mode) {
      // Redact submission titles
      const titleElements = document.querySelectorAll('h2.bc-submission-card__title');
      titleElements.forEach(element => {
        if (!element.dataset.caOriginalText) {
          element.dataset.caOriginalText = element.textContent;
          element.textContent = '[REDACTED]';
          element.style.color = '#999';
          element.style.fontStyle = 'italic';
        }
      });

      // Redact monetary rewards
      const rewardElements = document.querySelectorAll('span.bc-reward');
      rewardElements.forEach(element => {
        if (!element.dataset.caOriginalText) {
          element.dataset.caOriginalText = element.textContent;
          element.textContent = '[REDACTED]';
          element.style.color = '#999';
          element.style.fontStyle = 'italic';
        }
      });

      // Redact statistics figures
      const statElements = document.querySelectorAll('span.bc-stat__fig');
      statElements.forEach(element => {
        if (!element.dataset.caOriginalText) {
          element.dataset.caOriginalText = element.textContent;
          element.textContent = '[REDACTED]';
          element.style.color = '#999';
          element.style.fontStyle = 'italic';
        }
      });
    } else {
      // Restore original content when privacy mode is disabled
      const redactedElements = document.querySelectorAll('[data-ca-original-text]');
      redactedElements.forEach(element => {
        element.textContent = element.dataset.caOriginalText;
        element.style.color = '';
        element.style.fontStyle = '';
        delete element.dataset.caOriginalText;
      });
    }
  });
}

// Hide Bounties: blank out every reward figure — the sidebar totals on the
// submissions list, the reward on each submission card, and on an individual
// submission both the sidebar figure and any "rewarded $X" activity entries. They all
// share span.bc-reward, including the "N points" and "Still being assessed" variants:
// leaving those visible while blanking the amounts would still show which submissions
// were paid.
// Every write here has to be conditional. init() is the MutationObserver callback,
// and assigning textContent replaces the text node even when the string is identical,
// which emits a childList record and re-triggers init() — an unbroken loop that locks
// up the renderer. A pass that changes nothing must touch nothing.
function updateHideBountiesButtonState(btn, hidden) {
  const textSpan = btn.querySelector('.ca-toolbar__btn-text');
  const label = hidden ? 'Show Bounties' : 'Hide Bounties';
  if (textSpan && textSpan.textContent !== label) {
    textSpan.textContent = label;
  }

  btn.classList.toggle('ca-toolbar__btn--active', hidden);

  const pressed = hidden ? 'true' : 'false';
  if (btn.getAttribute('aria-pressed') !== pressed) {
    btn.setAttribute('aria-pressed', pressed);
  }
}

function setHiddenStyle(element, hidden) {
  const next = hidden ? 'hidden' : ''; // '' restores the page default
  if (element.style.visibility !== next) {
    element.style.visibility = next;
  }
}

// init() re-runs on every DOM mutation, so cache the flag instead of hitting
// storage.sync each time while touching every reward node on the page. The
// storage.onChanged listener below refreshes it when the setting is toggled.
let hideBountiesCached = null;

function paintHideBounties(hidden) {
  const sidebar = document.querySelector(HIDE_BOUNTIES_SELECTOR);
  if (sidebar) {
    setHiddenStyle(sidebar, hidden);
  }

  document.querySelectorAll('span.bc-reward').forEach((element) => {
    setHiddenStyle(element, hidden);
  });

  const btn = document.getElementById('ca-hide-bounties-button');
  if (btn) updateHideBountiesButtonState(btn, hidden);
}

function applyHideBounties() {
  if (hideBountiesCached !== null) {
    paintHideBounties(hideBountiesCached);
    return;
  }

  safeStorageGet(['hide_bounties'], function(result) {
    if (!result) return;
    hideBountiesCached = !!result.hide_bounties;
    paintHideBounties(hideBountiesCached);
  });
}

// One control shared by the submissions list and individual submissions, so the
// toggle looks and behaves the same wherever it appears. Only one exists per page, so
// the ids stay unique and paintHideBounties() updates whichever is present.
function buildHideBountiesToolbar() {
  const featureContainer = document.createElement('div');
  featureContainer.id = 'ca-hide-bounties-feature-container';
  featureContainer.className = 'ca-toolbar ca-toolbar--bordered';
  featureContainer.style.marginBottom = '12px';

  const label = document.createElement('span');
  label.textContent = 'CrowdAssist';
  label.className = 'ca-toolbar__label';
  featureContainer.appendChild(label);

  const divider = document.createElement('div');
  divider.className = 'ca-toolbar__divider';
  featureContainer.appendChild(divider);

  const toggleButton = createToolbarButton('ca-hide-bounties-button', 'Hide Bounties', CA_ICONS.eyeSlash);
  toggleButton.addEventListener('click', () => {
    // Only write storage; the onChanged listener re-applies and updates the button.
    safeStorageGet(['hide_bounties'], function(result) {
      safeStorageSet({ hide_bounties: !(result && result.hide_bounties) });
    });
  });
  featureContainer.appendChild(toggleButton);

  applyToolbarTheme(featureContainer);
  return featureContainer;
}

function addHideBountiesButton() {
  if (document.getElementById('ca-hide-bounties-feature-container')) return;

  if (isSubmissionsListPage()) {
    const targetEl = document.querySelector(HIDE_BOUNTIES_SELECTOR);
    if (!targetEl) return; // sidebar not rendered yet

    const row = targetEl.closest('.row');
    if (!row) return;

    // Sits outside the sidebar column, which is the element that gets hidden
    row.insertAdjacentElement('beforebegin', buildHideBountiesToolbar());
    applyHideBounties();
    return;
  }

  if (isReportVisualizationPage()) {
    // Submissions hide individual span.bc-reward nodes rather than a container, so a
    // toolbar in the status column stays visible while bounties are hidden
    const sidebar = document.querySelector('#researcher-submission > div.row > div.col-md-3.col-md-push-9');
    if (!sidebar) return;

    sidebar.insertAdjacentElement('afterbegin', buildHideBountiesToolbar());
    applyHideBounties();
  }
}

// Listen for storage changes to update privacy mode in real-time
try {
  if (browser.runtime && browser.runtime.id) {
    browser.storage.onChanged.addListener(function(changes, namespace) {
      if (changes.privacy_mode) {
        applyPrivacyMode();
      }
      if (changes.hide_bounties) {
        hideBountiesCached = !!changes.hide_bounties.newValue;
        paintHideBounties(hideBountiesCached);
      }
      if (changes.theme_mode) {
        document.querySelectorAll('[data-ca-theme]').forEach(el => applyToolbarTheme(el));
      }
    });
  }
} catch (error) {
  console.warn('CrowdAssist: Error setting up storage listener:', error);
}

// Listen for system theme changes if user has "system" selected
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    safeStorageGet(['theme_mode'], function(result) {
      if (!result) return;
      if (result.theme_mode === 'system' || !result.theme_mode) {
        document.querySelectorAll('[data-ca-theme]').forEach(el => applyToolbarTheme(el));
      }
    });
  });
}

function init() {
  // Apply privacy mode
  applyPrivacyMode();

  // Rewards show up on the submissions list and on individual submissions, so this
  // runs regardless of page type
  applyHideBounties();

  // Add buttons based on page type
  if (isReportCreationPage()) {
    // Report creation pages: /engagements/.../submissions/new or /engagements/.../submissions/UUID/edit
    addReportCreationButtons();
  } else if (isReportVisualizationPage()) {
    // Report visualization pages: /submissions/UUID
    addCopyButton();
    addTriagedTimeIndicator();
    addHideBountiesButton();
    addIncludeIpButton();
    addFixFormattingButton();
    addAiReviewButton();
    addAutoReplyButton();
  } else if (isSubmissionsListPage()) {
    // Submissions list page: /submissions
    addHideBountiesButton();
  } else {
    // Regular comment/interaction pages
    addCopyButton();
    addIncludeIpButton();
    addFixFormattingButton();
    addAiReviewButton();
    addAutoReplyButton();
  }

  const commentBox = document.querySelector('#create-comment-body');

  if (!commentBox || commentBox.dataset.caInit) {
    return;
  }

  console.log('CrowdAssist: Comment box found, initializing...');
  commentBox.dataset.caInit = 'true';
  
  const handleTooltip = () => updateTooltipState(commentBox);

  commentBox.addEventListener('input', handleTooltip);
  commentBox.addEventListener('keyup', handleTooltip);
  commentBox.addEventListener('click', handleTooltip);

  commentBox.addEventListener('keydown', (event) => {
    if (tooltip && event.key === 'Enter') {
      event.preventDefault();

      const firstUsername = tooltip.querySelector('li').textContent;
      const text = commentBox.value;
      const cursorPosition = commentBox.selectionStart;
      const textBeforeCursor = text.substring(0, cursorPosition);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex === -1) { hideTooltip(); return; }

      const query = text.substring(atIndex + 1, cursorPosition);
      const textToInsert = firstUsername + ' ';

      commentBox.focus();
      commentBox.setSelectionRange(atIndex + 1, atIndex + 1 + query.length);
      document.execCommand('insertText', false, textToInsert);

      hideTooltip();
    }
  });
}

// Run on page load
init();

// Also use a mutation observer to handle dynamic loading
const observer = new MutationObserver(init);
observer.observe(document.body, {
  childList: true,
  subtree: true
}); 