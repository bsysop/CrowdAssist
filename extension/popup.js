document.addEventListener('DOMContentLoaded', function() {
  const tokenInput = document.getElementById('openai-token');
  // const privacyModeCheckbox = document.getElementById('privacy-mode'); // Privacy mode temporarily disabled
  const themeSelect = document.getElementById('theme-mode');
  const saveButton = document.getElementById('save-token');
  const testButton = document.getElementById('test-token');
  const statusDiv = document.getElementById('status');

  // Load existing settings
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
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}); 