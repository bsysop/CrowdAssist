// Background service worker for CrowdAssist
// Browser API compatibility shim for Chrome and Firefox
if (typeof browser === 'undefined') {
  var browser = chrome;
}

console.log('CrowdAssist background service worker started');

// Alarm name for session refresh
const SESSION_REFRESH_ALARM = 'bugcrowd-session-refresh';

// Initialize the extension
browser.runtime.onInstalled.addListener(async () => {
  console.log('CrowdAssist installed/updated');
  
  // Set default value for auto_renew_session if not set
  const result = await browser.storage.sync.get(['auto_renew_session']);
  if (result.auto_renew_session === undefined) {
    await browser.storage.sync.set({ auto_renew_session: true });
    console.log('Auto-renew session enabled by default');
  }
  
  // Start the alarm if auto-renew is enabled
  if (result.auto_renew_session !== false) {
    await startSessionRefreshAlarm();
  }
});

// Start on extension startup
browser.runtime.onStartup.addListener(async () => {
  console.log('CrowdAssist startup');
  
  const result = await browser.storage.sync.get(['auto_renew_session']);
  if (result.auto_renew_session !== false) {
    await startSessionRefreshAlarm();
  }
});

// Listen for storage changes to enable/disable the alarm
browser.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync' && changes.auto_renew_session) {
    const isEnabled = changes.auto_renew_session.newValue;
    
    if (isEnabled) {
      console.log('Auto-renew session enabled');
      await startSessionRefreshAlarm();
      // Immediately refresh once when enabled
      await refreshSession();
    } else {
      console.log('Auto-renew session disabled');
      await stopSessionRefreshAlarm();
    }
  }
});

// Listen for alarm
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SESSION_REFRESH_ALARM) {
    console.log('Session refresh alarm triggered');
    await refreshSession();
  }
});

// Start the alarm
async function startSessionRefreshAlarm() {
  // Clear any existing alarm first
  await browser.alarms.clear(SESSION_REFRESH_ALARM);
  
  // Create alarm that fires every 60 minutes
  await browser.alarms.create(SESSION_REFRESH_ALARM, {
    delayInMinutes: 60,
    periodInMinutes: 60
  });
  
  console.log('Session refresh alarm started (every 60 minutes)');
  
  // Also trigger an immediate refresh
  await refreshSession();
}

// Stop the alarm
async function stopSessionRefreshAlarm() {
  await browser.alarms.clear(SESSION_REFRESH_ALARM);
  console.log('Session refresh alarm stopped');
}

// Main function to refresh the Bugcrowd session
async function refreshSession() {
  try {
    // Check if auto-renew is enabled
    const result = await browser.storage.sync.get(['auto_renew_session']);
    if (result.auto_renew_session === false) {
      console.log('Auto-renew is disabled, skipping refresh');
      return;
    }
    
    // Get all cookies for bugcrowd.com domain
    const cookies = await browser.cookies.getAll({
      domain: '.bugcrowd.com'
    });
    
    if (!cookies || cookies.length === 0) {
      console.log('No Bugcrowd cookies found, user may not be logged in');
      return;
    }
    
    console.log(`Found ${cookies.length} Bugcrowd cookies`);
    
    // Build cookie header
    const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    
    // Send refresh request
    const response = await fetch('https://login.hackers.bugcrowd.com/api/v1/sessions/me/lifecycle/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      console.log('✓ Bugcrowd session refreshed successfully');
    } else {
      console.error('✗ Failed to refresh session:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('✗ Error refreshing Bugcrowd session:', error);
  }
}

// Export for testing (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { refreshSession, startSessionRefreshAlarm, stopSessionRefreshAlarm };
}

