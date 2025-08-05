// Theme utility functions
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getCurrentTheme(callback) {
  chrome.storage.sync.get(['theme_mode'], function(result) {
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
  
  // Apply theme to select
  const select = document.getElementById('theme-mode');
  if (select) {
    select.style.backgroundColor = styles.selectBackground;
    select.style.color = styles.inputColor;
    select.style.borderColor = styles.selectBorder;
  }
  
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
  const tokenInput = document.getElementById('openai-token');
  // const privacyModeCheckbox = document.getElementById('privacy-mode'); // Privacy mode temporarily disabled
  const themeSelect = document.getElementById('theme-mode');
  const saveButton = document.getElementById('save-token');
  const testButton = document.getElementById('test-token');
  const statusDiv = document.getElementById('status');

  // Load existing settings and apply theme
  chrome.storage.sync.get(['openai_token', 'theme_mode'], function(result) {
    if (result.openai_token) {
      tokenInput.value = result.openai_token;
      testButton.disabled = false;
    }
    // Privacy mode temporarily disabled
    // if (result.privacy_mode) {
    //   privacyModeCheckbox.checked = result.privacy_mode;
    // }
    if (result.theme_mode) {
      themeSelect.value = result.theme_mode;
    } else {
      themeSelect.value = 'system'; // Default to system
    }
    
    // Apply the current theme
    getCurrentTheme(applyTheme);
  });

  // Listen for theme changes to provide live preview
  themeSelect.addEventListener('change', function() {
    const selectedTheme = this.value;
    let actualTheme;
    
    if (selectedTheme === 'system') {
      actualTheme = getSystemTheme();
    } else {
      actualTheme = selectedTheme;
    }
    
    applyTheme(actualTheme);
  });

  // Save settings
  saveButton.addEventListener('click', function() {
    const token = tokenInput.value.trim();
    // const privacyMode = privacyModeCheckbox.checked; // Privacy mode temporarily disabled
    const themeMode = themeSelect.value;
    
    if (!token) {
      showStatus('Please enter a valid token', 'error');
      return;
    }

    if (!token.startsWith('sk-')) {
      showStatus('Token should start with "sk-"', 'error');
      return;
    }

    chrome.storage.sync.set({
      openai_token: token,
      // privacy_mode: privacyMode, // Privacy mode temporarily disabled
      theme_mode: themeMode
    }, function() {
      showStatus('Settings saved successfully!', 'success');
      testButton.disabled = false;
      
      // Apply the new theme immediately
      getCurrentTheme(applyTheme);
    });
  });

  // Test token
  testButton.addEventListener('click', async function() {
    const token = tokenInput.value.trim();
    
    if (!token) {
      showStatus('Please enter a token first', 'error');
      return;
    }

    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    
    try {
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
  
  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      // Only update if user has "system" selected
      chrome.storage.sync.get(['theme_mode'], function(result) {
        const themeMode = result.theme_mode || 'system';
        if (themeMode === 'system') {
          getCurrentTheme(applyTheme);
        }
      });
    });
  }
}); 