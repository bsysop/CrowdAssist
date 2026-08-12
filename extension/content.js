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
//
// Which events to fire depends on the control. A textarea only needs "input"; a <select>
// needs "change", because that is the event React maps onChange to for a select. Measured
// on the submission form's Target field: assigning .value alone leaves React's own value
// prop at "", so the field looks set but submits empty against its required attribute.
function setNativeValue(element, value, eventNames = ['input']) {
  const ownSetter = (Object.getOwnPropertyDescriptor(element, 'value') || {}).set;
  const prototypeSetter = (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value') || {}).set;

  if (prototypeSetter && ownSetter !== prototypeSetter) {
    prototypeSetter.call(element, value);
  } else if (ownSetter) {
    ownSetter.call(element, value);
  } else {
    element.value = value;
  }

  eventNames.forEach((name) => element.dispatchEvent(new Event(name, { bubbles: true })));
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

// Bugcrowd only renders the report as HTML on the read-only page; there is no raw-markdown
// source to fetch (the JSON endpoint 406s, the props carry description_html only). So Copy as
// Markdown reconstructs from HTML, and the reconstruction is what has to be good. Vanilla
// Turndown's defaults are the weak part: setext headings, indented (unfenced) code, no table
// rule at all. These options and rules fix that.
function buildReportTurndownService() {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  // Fenced code from textContent. Bugcrowd wraps code in Rouge syntax highlighting
  // (<div class="highlight"><pre><code><span>...), and that span soup mangles the default
  // output. Reading textContent strips the spans and the wrapper. No language class is emitted,
  // so the fence is plain.
  td.addRule('caCodeBlock', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (content, node) => '\n\n```\n' + node.textContent.replace(/\n+$/, '') + '\n```\n\n'
  });

  // GFM pipe tables. Turndown has no table rule, so a <table> otherwise flattens into
  // concatenated cell text. querySelectorAll('tr') flattens thead/tbody transparently.
  td.addRule('caTable', {
    filter: 'table',
    replacement: (content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (!rows.length) return content;
      const cell = (c) => c.textContent.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
      const line = (tr) => '| ' + Array.from(tr.children).map(cell).join(' | ') + ' |';
      const sep = '| ' + Array.from(rows[0].children).map(() => '---').join(' | ') + ' |';
      return '\n\n' + [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n') + '\n\n';
    }
  });

  return td;
}

function copyReportAsMarkdown() {
  const button = document.getElementById('ca-copy-markdown-button');
  const textSpan = button.querySelector('.ca-toolbar__btn-text');
  const originalText = textSpan.textContent;

  const turndownService = buildReportTurndownService();
  const submissionElement = document.querySelector('.bc-helper-nopadding');

  if (submissionElement) {
    // Clone the element and remove the feature container from the clone to prevent it from being copied
    const submissionClone = submissionElement.cloneNode(true);
    const featureContainerInClone = submissionClone.querySelector('#ca-copy-feature-container');
    if (featureContainerInClone) {
      featureContainerInClone.remove();
    }

    // Resolve relative image/link URLs to absolute, so pasted content still points at Bugcrowd.
    submissionClone.querySelectorAll('img[src], a[href]').forEach((el) => {
      const attr = el.tagName === 'IMG' ? 'src' : 'href';
      const v = el.getAttribute(attr);
      if (v && !/^(https?:|data:|mailto:|#)/i.test(v)) {
        try { el.setAttribute(attr, new URL(v, location.origin).href); } catch (e) {}
      }
    });

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

// Lists what each rule changed and what could not be auto-fixed, so the user approves the
// rewrite before it lands. Populated through the DOM rather than an HTML string: warning
// messages quote the report back, and createModal assigns its argument to innerHTML.
function showFormatPreviewModal(applied, warnings, total, onApply) {
  getCurrentTheme((theme) => {
    const styles = getThemeStyles(theme);
    const heading = total === 0
      ? 'Style Guide Check'
      : `Style Guide Fixes (${total})`;

    const shell = `
      <h3 style="margin: 0 0 4px 0; color: ${styles.color};">${heading}</h3>
      <div style="font-size: 11px; opacity: 0.7; margin-bottom: 16px; color: ${styles.color};">
        Bugcrowd Pen Test Submission Style Guide v1.1
      </div>
      <div id="ca-format-list" style="background: ${styles.codeBackground}; padding: 14px 16px; border-radius: 4px; max-height: 380px; overflow-y: auto; font-size: 13px; line-height: 1.7; color: ${styles.color};"></div>
    `;

    createModal(shell, [
      { text: 'Cancel', onClick: () => {} },
      {
        text: total === 0 ? 'Close' : `Apply ${total} ${total === 1 ? 'Fix' : 'Fixes'}`,
        primary: true,
        onClick: () => { if (total > 0) onApply(); }
      }
    ], (modal) => {
      const list = modal.querySelector('#ca-format-list');
      if (!list) return;

      const row = (mark, markColor, label, tail) => {
        const line = document.createElement('div');
        line.style.cssText = 'display: flex; gap: 8px; align-items: baseline;';

        const icon = document.createElement('span');
        icon.textContent = mark;
        icon.style.cssText = `color: ${markColor}; flex: 0 0 auto;`;

        const body = document.createElement('span');
        body.textContent = label;
        body.style.cssText = 'flex: 1 1 auto;';

        line.appendChild(icon);
        line.appendChild(body);

        if (tail) {
          const count = document.createElement('span');
          count.textContent = tail;
          count.style.cssText = 'flex: 0 0 auto; opacity: 0.6; font-variant-numeric: tabular-nums;';
          line.appendChild(count);
        }

        list.appendChild(line);
      };

      applied.forEach((rule) => row('✓', '#3fb950', rule.label, String(rule.count)));

      if (applied.length === 0) {
        row('·', styles.color, 'No formatting changes needed', '');
      }

      if (warnings.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = `margin: 12px 0 8px 0; padding-top: 10px; border-top: 1px solid ${styles.inputBorder}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6;`;
        divider.textContent = 'Needs your attention — not auto-fixed';
        list.appendChild(divider);

        warnings.forEach((warning) => row('⚠', '#d29922', `Line ${warning.line} — ${warning.message}`, ''));
      }
    });
  });
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

  const { applyFormatRules, scanFormatWarnings } = window.CrowdAssistFormat;
  const { text, applied, total } = applyFormatRules(textarea.value || '');
  // Warnings are scanned against the fixed text so their line numbers match what the
  // user sees once Apply lands, not the draft they are replacing.
  const warnings = scanFormatWarnings(text);

  if (total === 0 && warnings.length === 0) {
    flashButtonLabel(btn, 'Nothing to fix');
    return;
  }

  showFormatPreviewModal(applied, warnings, total, () => {
    setNativeValue(textarea, text);
    flashButtonLabel(btn, total === 1 ? '1 fix applied' : `${total} fixes applied`);
  });
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

// The Target picker on the submission form. Verified markup:
//   div.bc-form__group > label.bc-label + div.bc-dropdown.bc-dropdown--block > select#submission_target_id
// The first three are the real thing; the last is a shape match for a renamed field.
function getTargetSelect() {
  return document.getElementById('submission_target_id') ||
         document.querySelector('select[name="submission[target_id]"]') ||
         document.querySelector('select[name*="target"]') ||
         Array.from(document.querySelectorAll('select'))
           .find((select) => /select target/i.test(((select.options[0] || {}).text) || '')) ||
         null;
}

// Case-insensitive substring match, rendered with the matched run marked. Substring rather
// than the prefix match the @-mention tooltip uses, because every target here shares a base
// domain — searching "cloudtrace" has to find it inside "http://cloudtrace2.example.com/".
function renderOptionLabel(li, text, query) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;

  if (at === -1) {
    li.textContent = text;
    return;
  }

  li.textContent = '';
  li.appendChild(document.createTextNode(text.slice(0, at)));
  const hit = document.createElement('mark');
  hit.className = 'ca-combo__match';
  hit.textContent = text.slice(at, at + query.length);
  li.appendChild(hit);
  li.appendChild(document.createTextNode(text.slice(at + query.length)));
}

function addSearchableTargetSelect() {
  if (document.getElementById('ca-target-combo')) return;

  const select = getTargetSelect();
  const host = select && select.parentElement;
  if (!select || !host) return;

  // Opted out for this page load. Without this the next mutation tick would rebuild the
  // widget a frame after "Use the original dropdown" removed it.
  if (select.dataset.caComboOff) return;

  // Flagged as wired, but our node is gone — React re-rendered the field and dropped the
  // sibling it did not own. Reset and rebuild, or the native select stays hidden behind
  // nothing and the target becomes unselectable.
  if (select.dataset.caCombo) {
    host.classList.remove('ca-combo-host');
    select.classList.remove('ca-combo-native');
    delete select.dataset.caCombo;
  }

  // Read live on every render rather than snapshotting at build time. React populates this
  // select asynchronously and re-renders it later, so a snapshot taken on the wrong tick
  // sticks forever — observed as a picker that opened with zero rows. Eight options is
  // nothing to re-read; correctness wins over saving the walk.
  const currentOptions = () => Array.from(select.options).filter((option) => option.value !== '');
  const placeholderOption = () => Array.from(select.options).find((option) => option.value === '');

  const placeholder = placeholderOption();
  if (currentOptions().length === 0) return;

  select.dataset.caCombo = 'true';
  host.classList.add('ca-combo-host');
  select.classList.add('ca-combo-native');

  const combo = document.createElement('div');
  combo.id = 'ca-target-combo';
  combo.className = 'ca-combo';

  // The magnifier is the only thing telling anyone this field can be typed into — without
  // it the widget is pixel-identical to the select it replaced, and the feature goes
  // undiscovered.
  const searchIcon = document.createElement('span');
  searchIcon.className = 'ca-combo__search';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M7 1a6 6 0 1 0 3.71 10.71l3.29 3.29 1.41-1.41-3.29-3.29A6 6 0 0 0 7 1zm0 1.6A4.4 4.4 0 1 1 7 11.4 4.4 4.4 0 0 1 7 2.6z" fill="currentColor"/></svg>';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'ca-target-combo-input';
  input.className = 'ca-combo__input';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'ca-target-combo-menu');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('autocomplete', 'off');
  // The page's <label for="submission_target_id"> points at the select we hid, so without
  // this the combobox reaches a screen reader unnamed.
  const pageLabel = document.querySelector('label[for="' + select.id + '"]');
  input.setAttribute('aria-label', (pageLabel ? pageLabel.textContent.trim() : 'Target') + ' — search or select');
  input.placeholder = 'Search or select a target…';

  // Restores the one thing the native select could do that the combobox could not: go back
  // to nothing selected.
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'ca-combo__clear';
  clearButton.setAttribute('aria-label', 'Clear the selected target');
  clearButton.hidden = true;
  clearButton.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';

  const chevron = document.createElement('span');
  chevron.className = 'ca-combo__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 20 20" width="12" height="12"><path d="M4.5 7l5.5 6 5.5-6z" fill="currentColor"/></svg>';

  const menu = document.createElement('ul');
  menu.id = 'ca-target-combo-menu';
  menu.className = 'ca-combo__menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  combo.appendChild(searchIcon);
  combo.appendChild(input);
  combo.appendChild(clearButton);
  combo.appendChild(chevron);
  combo.appendChild(menu);

  let open = false;
  let activeIndex = -1;
  let visible = [];
  let echoGuard = false;

  const selectedText = () => {
    const option = select.options[select.selectedIndex];
    return option && option.value !== '' ? option.text : '';
  };

  // init() is the MutationObserver callback, so an unconditional write here would emit a
  // record, re-enter init(), and spin. Nothing is touched unless it actually differs.
  const setInputValue = (next) => {
    if (input.value !== next) input.value = next;
  };

  function restoreNative(message) {
    host.classList.remove('ca-combo-host');
    select.classList.remove('ca-combo-native');
    delete select.dataset.caCombo;
    select.dataset.caComboOff = 'true';
    select.removeEventListener('change', onExternalChange);
    document.removeEventListener('mousedown', onDocumentDown, true);
    combo.remove();
    if (message) console.warn('CrowdAssist:', message);
  }

  // The displayed text must always be the selected target — never a leftover query. Closing
  // by any route (click away, Tab, commit) runs through here, otherwise the field shows a
  // search string the form will not submit and the user reads it as their choice.
  function syncFromSelect() {
    const text = selectedText();
    setInputValue(text);
    if (clearButton.hidden === !!text) clearButton.hidden = !text;
  }

  function close() {
    syncFromSelect();
    if (!open) return;
    open = false;
    activeIndex = -1;
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (input.getAttribute('aria-activedescendant')) input.removeAttribute('aria-activedescendant');
  }

  function setActive(index) {
    activeIndex = index;
    let activeId = '';
    Array.from(menu.querySelectorAll('.ca-combo__option')).forEach((li, i) => {
      const isActive = i === index;
      const flag = isActive ? 'true' : 'false';
      // Conditional, like every other write that runs under the MutationObserver — an
      // identical assignment still emits a record and re-enters init().
      if (li.classList.contains('is-active') !== isActive) li.classList.toggle('is-active', isActive);
      if (li.getAttribute('aria-selected') !== flag) li.setAttribute('aria-selected', flag);
      if (isActive) { activeId = li.id; li.scrollIntoView({ block: 'nearest' }); }
    });

    // What a screen reader reads out as the highlight moves.
    if (activeId) {
      if (input.getAttribute('aria-activedescendant') !== activeId) input.setAttribute('aria-activedescendant', activeId);
    } else if (input.getAttribute('aria-activedescendant')) {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function commit(option) {
    const value = option ? option.value : '';

    echoGuard = true;
    setNativeValue(select, value, ['input', 'change']);
    echoGuard = false;

    // The write is only believable if it survived. React owns this select, so a future
    // change to how Bugcrowd binds it would otherwise leave a picker that looks like it
    // works and silently submits nothing.
    if (select.value !== value) {
      restoreNative('could not set the target through the searchable picker, restored the original dropdown');
      return;
    }

    close();
  }

  function render() {
    const options = currentOptions();
    const query = input.value.trim();
    const current = selectedText();
    // A closed-then-reopened box shows everything rather than filtering by the text it is
    // already displaying, which would otherwise show a single row.
    const effective = query === current ? '' : query;

    visible = effective
      ? options.filter((option) => option.text.toLowerCase().includes(effective.toLowerCase()))
      : options.slice();

    menu.textContent = '';

    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ca-combo__empty';
      empty.textContent = 'No target matches “' + effective + '”';
      menu.appendChild(empty);
    }

    visible.forEach((option, i) => {
      const li = document.createElement('li');
      li.id = 'ca-target-combo-opt-' + i;
      li.className = 'ca-combo__option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.value = option.value;
      // Rows ellipsize, and these URLs often differ only near the end.
      li.title = option.text;
      renderOptionLabel(li, option.text, effective);
      if (option.value === select.value) li.classList.add('is-selected');
      li.addEventListener('mousedown', (event) => {
        event.preventDefault();
        commit(option);
      });
      li.addEventListener('mouseenter', () => setActive(i));
      menu.appendChild(li);
    });

    // A native <select> popup cannot be opened from script, so the only real fallback is to
    // hand the original control back. Living in the menu puts it where someone looks when
    // the search is not finding what they want.
    const escape = document.createElement('li');
    escape.className = 'ca-combo__native-row';
    escape.textContent = 'Use the original dropdown';
    escape.addEventListener('mousedown', (event) => {
      event.preventDefault();
      restoreNative(null);
    });
    menu.appendChild(escape);

    // Start on whatever is already chosen, not on row 0 — otherwise a long scope list opens
    // scrolled to the top with no sign of which target is currently set.
    const currentIndex = visible.findIndex((option) => option.value === select.value);
    setActive(visible.length === 0 ? -1 : (currentIndex === -1 ? 0 : currentIndex));
  }

  function openMenu() {
    if (select.disabled) return;
    if (!open) {
      open = true;
      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    render();
  }

  function onExternalChange() {
    if (echoGuard) return;
    syncFromSelect();
  }

  function onDocumentDown(event) {
    if (!combo.contains(event.target)) close();
  }

  // Deliberately not wired to "focus": tabbing through the form should not throw a dropdown
  // over the fields below. Click, typing, or ArrowDown open it.
  //
  // Select-all has to be deferred. When focus comes from a click the browser places the
  // caret *after* the focus event, which wipes a selection made inside the handler —
  // measured: select() during focus leaves a zero-length selection, the same call a tick
  // later leaves all 20 characters selected. The collapsed-caret guard means a deliberate
  // drag-select is left alone.
  input.addEventListener('focus', () => {
    window.setTimeout(() => {
      if (document.activeElement === input && input.selectionStart === input.selectionEnd) input.select();
    }, 0);
  });
  input.addEventListener('click', openMenu);
  input.addEventListener('input', openMenu);

  clearButton.addEventListener('mousedown', (event) => {
    event.preventDefault();
    commit(null);
    input.focus();
  });

  chevron.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (open) { close(); return; }
    input.focus();
    openMenu();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      if (visible.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + visible.length) % visible.length);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!open || visible.length === 0) return;
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : visible.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      if (!open || activeIndex < 0 || !visible[activeIndex]) return;
      event.preventDefault();
      commit(visible[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      close();
      return;
    }

    if (event.key === 'Tab') {
      close();
    }
  });

  select.addEventListener('change', onExternalChange);
  document.addEventListener('mousedown', onDocumentDown, true);

  // Mirror the native control's disabled state, or the replacement stays editable and looks
  // usable on a form where the real field is locked. Re-checked on every init() pass.
  select.dataset.caComboSync = 'true';

  syncFromSelect();
  if (input.disabled !== select.disabled) input.disabled = select.disabled;
  applyToolbarTheme(combo);
  select.insertAdjacentElement('afterend', combo);
}

// Runs on every init() tick for an already-attached widget: keeps the replacement in step
// with the native control's disabled state, which React can flip at any time. Writes are
// conditional because init() is the MutationObserver callback.
function syncSearchableTargetSelect() {
  const combo = document.getElementById('ca-target-combo');
  if (!combo) return;

  const select = getTargetSelect();
  const input = document.getElementById('ca-target-combo-input');
  if (!select || !input) return;

  if (input.disabled !== select.disabled) input.disabled = select.disabled;
  if (combo.classList.contains('is-disabled') !== select.disabled) {
    combo.classList.toggle('is-disabled', select.disabled);
  }
}

// The VRT picker lists entries by name only, so five near-identical "IDOR > ..." rows that
// actually span P1 to P5 look interchangeable. These badges put the taxonomy's own priority
// on each row. Bugcrowd's copy beside the field is explicit that the VRT rating is a
// suggestion the program may override, so the badge says baseline, not verdict.
const CA_VRT_BADGE_TITLE = 'VRT baseline severity — the program may rate this differently';

// Wears Bugcrowd's own bc-badge--pN alongside our class. Their component is defined on this
// page and is already theme-aware, so the badge picks up the platform's exact priority
// colours and follows light/dark for free — no palette of ours to maintain, and it matches
// the P-badges shown everywhere else on Bugcrowd. Measured inside a dropdown row: their
// background, colour, border and radius survive; only padding and font-size are overridden
// by the row's own span rule, which is what our stylesheet puts back.
function makeVrtBadge(priority) {
  const badge = document.createElement('span');
  badge.className = 'ca-vrt-badge bc-badge bc-badge--p' + priority;
  badge.textContent = 'P' + priority;
  badge.title = CA_VRT_BADGE_TITLE;
  return badge;
}

// Holds the gutter open on rows the taxonomy leaves to the program. Without it their text
// starts 62px left of every badged row, and a single unindented row in a list of indented
// ones reads as a rendering fault. No text, no title, no bc-badge class: invisible to
// sighted users and silent to screen readers.
function emptyVrtBadge() {
  const badge = document.createElement('span');
  badge.className = 'ca-vrt-badge ca-vrt-badge--empty';
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

// Search rows carry the whole path in aria-label. Browse rows carry only the leaf name, so
// the path is rebuilt from the highlighted category and the subcategory heading above them.
function vrtPathForRow(row, container) {
  const label = row.getAttribute('aria-label');
  if (!label) return null;

  if (row.classList.contains('vrt-dropdown__opt--search')) return label;

  if (row.classList.contains('vrt-dropdown__opt--variant')) {
    const category = container.querySelector('.vrt-dropdown__opt--category.vrt-dropdown__opt--active, .vrt-dropdown__opt--category.vrt-dropdown__opt--selected');
    const subcategory = row.closest('.vrt-dropdown__opt--subcategory');
    const heading = subcategory && subcategory.querySelector(':scope > span');

    return [
      category && category.getAttribute('aria-label'),
      heading && heading.textContent.trim(),
      label
    ].filter(Boolean).join(' > ');
  }

  return null;
}

function annotateVrtRows(container, map) {
  const rows = container.querySelectorAll('.vrt-dropdown__opt--search, .vrt-dropdown__opt--variant');

  rows.forEach((row) => {
    // The marker is what stops the observer reacting to its own writes and spinning.
    if (row.dataset.caVrt) return;
    row.dataset.caVrt = '1';

    // No badge for the 86 entries the taxonomy leaves to the program — but still a
    // placeholder, so every row's text starts at the same x.
    const priority = window.CrowdAssistVrt.priorityFor(map, vrtPathForRow(row, container));
    const badge = priority === null ? emptyVrtBadge() : makeVrtBadge(priority);

    row.insertBefore(badge, row.firstChild);
    row.classList.add('ca-vrt-row');
  });
}

// The badge on the closed field, so the severity is still visible while reviewing the form.
function annotateVrtSelection(container, map) {
  const display = container.querySelector('.vrt-dropdown__select');
  if (!display || display.classList.contains('vrt-dropdown__select--placeholder')) {
    const stale = container.querySelector('.ca-vrt-badge--selected');
    if (stale) stale.remove();
    return;
  }

  const text = (display.textContent || '').replace(/\s+/g, ' ').trim();
  const priority = window.CrowdAssistVrt.priorityFor(map, text);
  const existing = container.querySelector('.ca-vrt-badge--selected');

  if (priority === null) {
    if (existing) existing.remove();
    return;
  }
  // Conditional: re-inserting an identical badge would emit a mutation record every pass.
  if (existing && existing.textContent === 'P' + priority) return;
  if (existing) existing.remove();

  const badge = makeVrtBadge(priority);
  badge.classList.add('ca-vrt-badge--selected');
  display.insertBefore(badge, display.firstChild);
}

// Code block colouring for the markdown editors.
//
// A textarea renders plain text, so the colours come from a <pre> mirrored exactly behind it
// while the textarea itself goes transparent. Everything below exists to keep those two layers
// on top of each other: any metric that affects where a glyph lands has to be copied, and the
// mirror has to re-measure whenever the box changes.
//
// Off by default. It is a visual layer over a field people rely on, so it is opt-in.
//
// Temporarily parked: the overlay showed instability (doubled glyphs / caret drift) and is under
// review, so the option was pulled from the popup. The implementation below is kept intact; to
// bring it back, flip this flag to true and restore the "Highlight Code Blocks" popup toggle.
// While false the feature never attaches, and any stale `highlight_code: true` in a tester's
// synced storage is ignored (loadCodeHighlightSetting forces it off).
const CA_HIGHLIGHT_CODE_ENABLED = false;
let highlightCodeCached = null;

// Properties that decide where characters land. Miss one and the layers ghost apart.
const CA_HL_MIRRORED = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing',
  'lineHeight', 'textTransform', 'textIndent', 'whiteSpace', 'wordBreak', 'overflowWrap',
  'tabSize', 'direction', 'boxSizing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'
];

// clientWidth, not offsetWidth. The field is overflow-y auto, so the moment the content
// outgrows the box a scrollbar appears and takes ~8px out of the content width. Every line
// re-wraps at that point, and an overlay still sized to the outer box drifts by exactly the
// scrollbar's width. This has to run on every repaint, not only on resize: the scrollbar
// appearing does not necessarily resize the element being observed.
function syncCodeHighlightSize(textarea, overlay) {
  const width = textarea.clientWidth + 'px';
  const height = textarea.clientHeight + 'px';
  if (overlay.style.width !== width) overlay.style.width = width;
  if (overlay.style.height !== height) overlay.style.height = height;
  if (overlay.style.top !== textarea.offsetTop + 'px') overlay.style.top = textarea.offsetTop + 'px';
  if (overlay.style.left !== textarea.offsetLeft + 'px') overlay.style.left = textarea.offsetLeft + 'px';
}

function paintCodeHighlight(textarea, overlay) {
  const html = window.CrowdAssistHighlight.highlight(textarea.value || '');
  // Conditional, like every write under the MutationObserver.
  if (overlay.innerHTML !== html) overlay.innerHTML = html;
  syncCodeHighlightSize(textarea, overlay);
  if (overlay.scrollTop !== textarea.scrollTop) overlay.scrollTop = textarea.scrollTop;
  if (overlay.scrollLeft !== textarea.scrollLeft) overlay.scrollLeft = textarea.scrollLeft;
}

// The full typography mirror. Only worth re-reading on attach and on a real resize, since
// getComputedStyle is the expensive part; the per-keystroke path uses syncCodeHighlightSize.
function syncCodeHighlightBox(textarea, overlay) {
  const cs = getComputedStyle(textarea);
  CA_HL_MIRRORED.forEach((prop) => {
    if (overlay.style[prop] !== cs[prop]) overlay.style[prop] = cs[prop];
  });
  syncCodeHighlightSize(textarea, overlay);
}

function detachCodeHighlight(textarea) {
  if (!textarea || !textarea.dataset.caHl) return;

  const overlay = textarea.caHlOverlay;
  if (overlay) {
    if (overlay.caHlResizeObserver) overlay.caHlResizeObserver.disconnect();
    overlay.remove();
  }

  textarea.removeEventListener('input', textarea.caHlPaint);
  textarea.removeEventListener('scroll', textarea.caHlPaint);
  textarea.classList.remove('ca-hl-host');
  textarea.style.color = textarea.dataset.caHlColor || '';
  textarea.style.caretColor = '';
  textarea.style.background = '';
  textarea.style.position = '';
  textarea.style.zIndex = '';

  delete textarea.dataset.caHl;
  delete textarea.dataset.caHlColor;
  delete textarea.caHlOverlay;
  delete textarea.caHlPaint;
}

function attachCodeHighlight(textarea) {
  if (!textarea || textarea.dataset.caHl) return;
  if (!window.CrowdAssistHighlight) return;

  const parent = textarea.parentElement;
  if (!parent) return;

  const cs = getComputedStyle(textarea);
  const original = cs.color;

  // `highlight` is what makes Bugcrowd's stylesheet colour our token spans, exactly as the VRT
  // badges wear bc-badge. Their rule also paints a black background that survives an inline
  // override, which is what the !important in style.css is for.
  const overlay = document.createElement('pre');
  overlay.className = 'ca-hl highlight';
  overlay.setAttribute('aria-hidden', 'true');

  // Positioning the overlay against the textarea's own offset box means the textarea is never
  // re-parented, so React's view of the DOM is untouched.
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  textarea.dataset.caHl = 'true';
  textarea.dataset.caHlColor = textarea.style.color || '';
  textarea.classList.add('ca-hl-host');
  textarea.style.position = 'relative';
  textarea.style.zIndex = '1';
  textarea.style.background = 'transparent';
  textarea.style.color = 'transparent';
  textarea.style.caretColor = original;

  const paint = () => paintCodeHighlight(textarea, overlay);
  textarea.caHlOverlay = overlay;
  textarea.caHlPaint = paint;
  textarea.addEventListener('input', paint);
  textarea.addEventListener('scroll', paint);

  textarea.insertAdjacentElement('afterend', overlay);
  syncCodeHighlightBox(textarea, overlay);
  paint();

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      syncCodeHighlightBox(textarea, overlay);
      paint();
    });
    observer.observe(textarea);
    overlay.caHlResizeObserver = observer;
  }
}

// Runs on every init() tick. Attaches or detaches to match the setting, and re-attaches if
// React replaced the field underneath us.
function applyCodeHighlight() {
  if (highlightCodeCached === null) return;

  const fields = [getReportDescriptionField(), document.querySelector('#create-comment-body')];

  fields.forEach((field) => {
    if (!field) return;
    if (highlightCodeCached) {
      if (!field.dataset.caHl) attachCodeHighlight(field);
      else if (!field.caHlOverlay || !field.caHlOverlay.isConnected) {
        detachCodeHighlight(field);
        attachCodeHighlight(field);
      }
    } else if (field.dataset.caHl) {
      detachCodeHighlight(field);
    }
  });
}

function addVrtSeverityBadges() {
  const container = document.querySelector('.vrt-dropdown');
  if (!container || container.dataset.caVrtInit) return;
  if (!window.CrowdAssistVrt) return;

  container.dataset.caVrtInit = 'true';

  let map = null;
  const paint = () => {
    if (!map) return;
    annotateVrtRows(container, map);
    annotateVrtSelection(container, map);
  };

  // Scoped to the dropdown, not document.body — the panel is rebuilt on every keystroke and
  // wipes our badges, but the global init() observer does not need to hear about any of it.
  const observer = new MutationObserver(paint);
  observer.observe(container, { childList: true, subtree: true });

  // May call back twice: once from cache, once more if a refresh lands. Rows render without
  // badges until then, which is what keeps this off the form's critical path.
  window.CrowdAssistVrt.loadVrtMap((loaded) => {
    map = loaded;
    paint();
  });
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

          // Section titles are bold, never "##". Bugcrowd's Pen Test Submission Style
          // Guide reserves markdown headers for the platform itself, so generating them
          // here would emit output that the Fix Formatting button has to undo.
          const userMessage = `Generate a report draft for the following finding. Preserve the full target URL including any query parameters.

TARGET URL: ${targetUrl}
VULNERABILITY TYPE: ${vulnType}

Produce exactly these sections, in this order, in markdown. Section titles use bold (\`**Title**\`) — never markdown headers (\`#\`, \`##\`), which Bugcrowd reserves for the platform. Write in the third person throughout; never "I" or "you".

**Summary**
One short paragraph describing the vulnerability at the target. Name the affected parameter/endpoint if it is evident from the URL.

**Affected Component**
- URL: the target URL
- Parameter(s): if evident from the URL, list them; otherwise write \`[verify]\`
- Authentication required: \`[verify]\`

**Steps to Reproduce**
A numbered list. Each item is one discrete action a triager can perform. Use fenced code blocks for any request, payload, or URL. Use \`[verify]\` for the exact payload string unless it is canonical for this vulnerability class. Do not start a step with "Now" or "Then". Do not end a list item with a period.

**Proof of Concept (PoC)**
A fenced code block containing a minimal HTTP request or curl command demonstrating the issue, with \`[verify]\` for any value that must be confirmed.

**Impact**
2–4 sentences, plain language, describing what an attacker can realistically achieve. No compliance/legal framing. No generic severity adjectives without justification.

**Remediation**
2–4 actionable bullets tailored to the vulnerability class.

**References**
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

// Same shape as applyHideBounties: read once, cache, and let storage.onChanged refresh it,
// so the setting is not re-read from storage on every DOM mutation.
function loadCodeHighlightSetting() {
  if (!CA_HIGHLIGHT_CODE_ENABLED) {
    // Feature parked (see CA_HIGHLIGHT_CODE_ENABLED). Force it off regardless of any stale
    // highlight_code:true in synced storage, and detach the overlay if it is somehow attached.
    highlightCodeCached = false;
    applyCodeHighlight();
    return;
  }

  if (highlightCodeCached !== null) {
    applyCodeHighlight();
    return;
  }

  safeStorageGet(['highlight_code'], function (result) {
    if (!result) return;
    highlightCodeCached = !!result.highlight_code;
    applyCodeHighlight();
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
      if (changes.highlight_code && CA_HIGHLIGHT_CODE_ENABLED) {
        highlightCodeCached = !!changes.highlight_code.newValue;
        applyCodeHighlight();
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

  // Both markdown editors can carry fenced code, so this is not page-type specific either
  loadCodeHighlightSetting();

  // Add buttons based on page type
  if (isReportCreationPage()) {
    // Report creation pages: /engagements/.../submissions/new or /engagements/.../submissions/UUID/edit
    addReportCreationButtons();
    addSearchableTargetSelect();
    syncSearchableTargetSelect();
    addVrtSeverityBadges();
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