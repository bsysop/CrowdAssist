// Theme utility functions
// Browser API compatibility shim for Chrome and Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getCurrentTheme(callback) {
  browser.storage.sync.get(['theme_mode'], function(result) {
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
      inputColor: '#e2e8f0',
      buttonBackground: '#FF6900',
      buttonHoverBackground: '#e55a00',
      buttonDisabledBackground: '#4a5568',
      headerColor: '#e2e8f0',
      labelColor: '#e2e8f0',
      helpTextColor: '#a0aec0',
      successBackground: '#2d5a3d',
      successColor: '#9ae6b4',
      successBorder: '#38a169',
      errorBackground: '#5a2d2d',
      errorColor: '#feb2b2',
      errorBorder: '#e53e3e',
      selectBackground: '#2d3748',
      selectBorder: '#4a5568'
    };
  } else {
    return {
      background: 'white',
      color: '#333',
      inputBackground: 'white',
      inputBorder: '#ddd',
      inputColor: '#333',
      buttonBackground: '#FF6900',
      buttonHoverBackground: '#e55a00',
      buttonDisabledBackground: '#ccc',
      headerColor: '#1a1a1a',
      labelColor: '#333',
      helpTextColor: '#666',
      successBackground: '#d4edda',
      successColor: '#155724',
      successBorder: '#c3e6cb',
      errorBackground: '#f8d7da',
      errorColor: '#721c24',
      errorBorder: '#f5c6cb',
      selectBackground: 'white',
      selectBorder: '#ddd'
    };
  }
}

function applyTheme(theme) {
  const styles = getThemeStyles(theme);
  
  // Apply theme to body
  document.body.style.backgroundColor = styles.background;
  document.body.style.color = styles.color;
  
  // Apply theme to header elements
  const headerH1 = document.querySelector('.header h1');
  const headerP = document.querySelector('.header p');
  if (headerH1) headerH1.style.color = styles.headerColor;
  if (headerP) headerP.style.color = styles.helpTextColor;
  
  // Apply theme to labels
  const labels = document.querySelectorAll('.form-group label, .checkbox-container label');
  labels.forEach(label => {
    label.style.color = styles.labelColor;
  });
  
  // Apply theme to inputs
  const inputs = document.querySelectorAll('input[type="password"], input[type="text"]');
  inputs.forEach(input => {
    input.style.backgroundColor = styles.inputBackground;
    input.style.color = styles.inputColor;
    input.style.borderColor = styles.inputBorder;
  });
  
  // Apply theme to selects
  document.querySelectorAll('select').forEach(select => {
    select.style.backgroundColor = styles.selectBackground;
    select.style.color = styles.inputColor;
    select.style.borderColor = styles.selectBorder;
  });
  
  // Apply theme to help text
  const helpTexts = document.querySelectorAll('.help-text');
  helpTexts.forEach(helpText => {
    helpText.style.color = styles.helpTextColor;
  });
  
  // Apply theme to buttons
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.style.backgroundColor = styles.buttonBackground;
    
    // Store original styles for hover effects
    button.addEventListener('mouseenter', function() {
      if (!this.disabled) {
        this.style.backgroundColor = styles.buttonHoverBackground;
      }
    });
    
    button.addEventListener('mouseleave', function() {
      if (!this.disabled) {
        this.style.backgroundColor = styles.buttonBackground;
      } else {
        this.style.backgroundColor = styles.buttonDisabledBackground;
      }
    });
    
    // Apply disabled state if needed
    if (button.disabled) {
      button.style.backgroundColor = styles.buttonDisabledBackground;
    }
  });
  
  // Update status styles (will be applied when status is shown)
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    // Store theme styles on the status div for later use
    statusDiv.setAttribute('data-theme-success-bg', styles.successBackground);
    statusDiv.setAttribute('data-theme-success-color', styles.successColor);
    statusDiv.setAttribute('data-theme-success-border', styles.successBorder);
    statusDiv.setAttribute('data-theme-error-bg', styles.errorBackground);
    statusDiv.setAttribute('data-theme-error-color', styles.errorColor);
    statusDiv.setAttribute('data-theme-error-border', styles.errorBorder);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const providerSelect = document.getElementById('ai-provider');
  const openaiTokenInput = document.getElementById('openai-token');
  const anthropicTokenInput = document.getElementById('anthropic-token');
  const openaiGroup = document.getElementById('openai-token-group');
  const anthropicGroup = document.getElementById('anthropic-token-group');
  // const privacyModeCheckbox = document.getElementById('privacy-mode'); // Privacy mode temporarily disabled
  const themeCheckbox = document.getElementById('theme-dark-mode');
  const autoRenewCheckbox = document.getElementById('auto-renew-session');
  const saveButton = document.getElementById('save-token');
  const testButton = document.getElementById('test-token');
  const statusDiv = document.getElementById('status');

  // Tracks whether the user explicitly toggled the theme this session.
  // While false, theme_mode stays unset so the popup keeps following the OS.
  let themeExplicit = false;

  function updateProviderVisibility() {
    const provider = providerSelect.value;
    openaiGroup.style.display = provider === 'openai' ? '' : 'none';
    anthropicGroup.style.display = provider === 'anthropic' ? '' : 'none';

    const currentToken = provider === 'anthropic'
      ? anthropicTokenInput.value.trim()
      : openaiTokenInput.value.trim();
    testButton.disabled = !currentToken;
  }

  // Load existing settings and apply theme
  browser.storage.sync.get(
    ['ai_provider', 'openai_token', 'anthropic_token', 'theme_mode', 'auto_renew_session'],
    function(result) {
      providerSelect.value = result.ai_provider || 'openai';
      if (result.openai_token) openaiTokenInput.value = result.openai_token;
      if (result.anthropic_token) anthropicTokenInput.value = result.anthropic_token;

      if (result.theme_mode === 'dark') {
        themeCheckbox.checked = true;
        themeExplicit = true;
      } else if (result.theme_mode === 'light') {
        themeCheckbox.checked = false;
        themeExplicit = true;
      } else {
        // Unset or legacy 'system' — follow OS, don't lock in a choice yet.
        themeCheckbox.checked = getSystemTheme() === 'dark';
        themeExplicit = false;
      }

      if (result.auto_renew_session !== undefined) {
        autoRenewCheckbox.checked = result.auto_renew_session;
      } else {
        autoRenewCheckbox.checked = true;
      }

      updateProviderVisibility();
      getCurrentTheme(applyTheme);
    }
  );

  providerSelect.addEventListener('change', updateProviderVisibility);
  openaiTokenInput.addEventListener('input', updateProviderVisibility);
  anthropicTokenInput.addEventListener('input', updateProviderVisibility);

  // Listen for theme changes to provide live preview
  themeCheckbox.addEventListener('change', function() {
    themeExplicit = true;
    applyTheme(this.checked ? 'dark' : 'light');
  });

  // Save settings
  saveButton.addEventListener('click', function() {
    const provider = providerSelect.value;
    const openaiToken = openaiTokenInput.value.trim();
    const anthropicToken = anthropicTokenInput.value.trim();
    const autoRenewSession = autoRenewCheckbox.checked;

    const activeToken = provider === 'anthropic' ? anthropicToken : openaiToken;
    if (!activeToken) {
      showStatus(`Please enter a ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API token`, 'error');
      return;
    }

    if (provider === 'openai' && !openaiToken.startsWith('sk-')) {
      showStatus('OpenAI token should start with "sk-"', 'error');
      return;
    }
    if (provider === 'anthropic' && !anthropicToken.startsWith('sk-ant-')) {
      showStatus('Anthropic token should start with "sk-ant-"', 'error');
      return;
    }

    const payload = {
      ai_provider: provider,
      openai_token: openaiToken,
      anthropic_token: anthropicToken,
      auto_renew_session: autoRenewSession
    };
    if (themeExplicit) {
      payload.theme_mode = themeCheckbox.checked ? 'dark' : 'light';
    }

    browser.storage.sync.set(payload, function() {
      showStatus('Settings saved successfully!', 'success');
      testButton.disabled = !activeToken;
      getCurrentTheme(applyTheme);
    });
  });

  // Test token
  testButton.addEventListener('click', async function() {
    const provider = providerSelect.value;
    const token = provider === 'anthropic'
      ? anthropicTokenInput.value.trim()
      : openaiTokenInput.value.trim();

    if (!token) {
      showStatus('Please enter a token first', 'error');
      return;
    }

    testButton.disabled = true;
    testButton.textContent = 'Testing...';

    try {
      if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': token,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }]
          })
        });

        if (response.ok) {
          showStatus('Connection successful!', 'success');
        } else {
          let msg = 'Invalid token';
          try {
            const err = await response.json();
            if (err && err.error && err.error.message) msg = err.error.message;
          } catch (_) {}
          showStatus(`Error: ${msg}`, 'error');
        }
      } else {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          showStatus('Connection successful!', 'success');
        } else {
          const error = await response.json();
          showStatus(`Error: ${error.error?.message || 'Invalid token'}`, 'error');
        }
      }
    } catch (error) {
      showStatus('Connection failed. Check your internet connection.', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test Connection';
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    // Apply themed colors
    if (type === 'success') {
      statusDiv.style.backgroundColor = statusDiv.getAttribute('data-theme-success-bg');
      statusDiv.style.color = statusDiv.getAttribute('data-theme-success-color');
      statusDiv.style.borderColor = statusDiv.getAttribute('data-theme-success-border');
    } else if (type === 'error') {
      statusDiv.style.backgroundColor = statusDiv.getAttribute('data-theme-error-bg');
      statusDiv.style.color = statusDiv.getAttribute('data-theme-error-color');
      statusDiv.style.borderColor = statusDiv.getAttribute('data-theme-error-border');
    }
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
  
  // Listen for system theme changes — only react if the user hasn't locked in a choice
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      browser.storage.sync.get(['theme_mode'], function(result) {
        const mode = result.theme_mode;
        if (mode === 'light' || mode === 'dark') return; // explicit choice stored
        const systemTheme = getSystemTheme();
        if (!themeExplicit) themeCheckbox.checked = systemTheme === 'dark';
        applyTheme(systemTheme);
      });
    });
  }
}); 