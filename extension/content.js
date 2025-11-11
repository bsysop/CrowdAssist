// This script will be injected into the page
console.log("CrowdAssist content script loaded.");

// Chrome API utility functions
function safeStorageGet(keys, callback) {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.storage.sync.get(keys, function(result) {
        if (chrome.runtime.lastError) {
          console.warn('CrowdAssist: Storage error:', chrome.runtime.lastError);
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

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else {
    valueSetter.call(element, value);
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
    if (chrome.runtime && chrome.runtime.id) {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('turndown.js');
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
  const originalText = button.querySelector('span:last-child').textContent;

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
      button.querySelector('span:last-child').textContent = ' [Copied!]';
      setTimeout(() => {
        button.querySelector('span:last-child').textContent = originalText;
      }, 2000);
    }).catch(err => {
      console.error('CrowdAssist: Failed to copy text: ', err);
      button.querySelector('span:last-child').textContent = ' [Error!]';
      setTimeout(() => {
        button.querySelector('span:last-child').textContent = originalText;
      }, 2000);
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
    featureContainer.style.display = 'flex';
    featureContainer.style.alignItems = 'center';
    featureContainer.style.marginBottom = '5px';

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist:';
    label.style.fontWeight = 'bold';
    label.style.marginRight = '8px';
    featureContainer.appendChild(label);

    const copyButton = document.createElement('a');

    const iconSpan = document.createElement('span');
    iconSpan.dataset.testid = 'bc-icons';
    iconSpan.className = 'bc-icons bc-icons--markdown-icon bc-icons--parent-color';
    iconSpan.innerHTML = '<svg class="bc-icons__svg" viewBox="0 0 24 24" width="100%" height="100%" focusable="false" aria-hidden="true"><use href="#markdown-icon"></use></svg>';
    iconSpan.style.marginRight = '8px';
    copyButton.appendChild(iconSpan);

    const text = document.createElement('span');
    text.textContent = ' [Copy as Markdown]';
    copyButton.appendChild(text);

    copyButton.id = 'ca-copy-markdown-button';
    copyButton.style.cursor = 'pointer';
    copyButton.style.color = '#FF6900';
    copyButton.style.display = 'flex';
    copyButton.style.alignItems = 'center';
    copyButton.addEventListener('click', copyReportAsMarkdown);
    
    featureContainer.appendChild(copyButton);
    targetArea.prepend(featureContainer);
  }
}

// Calculate and display time from submission to triaged
function addTriagedTimeIndicator() {
  // Avoid duplicates; also clean up any old container id from previous implementation
  const existing = document.getElementById('ca-triage-time-indicator');
  if (existing) {
    return;
  }
  const oldExisting = document.getElementById('ca-triage-time-container');
  if (oldExisting) {
    oldExisting.remove();
  }

  // Check current Status badge text is exactly "Triaged"
  const statusSpan = document.querySelector('#researcher-submission > div.row > div.col-md-3.col-md-push-9 > div:nth-child(1) > p:nth-child(2) > span');
  if (!statusSpan) {
    return;
  }
  const statusText = statusSpan.textContent ? statusSpan.textContent.trim() : '';
  if (statusText !== 'Triaged') {
    return;
  }

  // Get submission time
  const submissionTimeEl = document.querySelector('#researcher-submission > div.row > div.col-md-9.col-md-pull-3 > div > ul > li > ul > li:nth-child(2) > div.col-md-9.cc-tabular-nums > time');
  const submissionDateStr = submissionTimeEl && submissionTimeEl.getAttribute('datetime');
  const submissionDate = submissionDateStr ? new Date(submissionDateStr) : null;

  if (!submissionDate) {
    return; // Cannot compute without submission date
  }

  // Find triaged activity block and its time
  const triageBadge = document.querySelector('.activity-block__content .bc-badge--triaged');
  if (!triageBadge) {
    return; // Not triaged yet
  }
  const triageBlock = triageBadge.closest('.activity-block__content');
  if (!triageBlock) {
    return;
  }
  const triageTimeEl = triageBlock.querySelector('.cc-datetime-stamp__absolute time') || triageBlock.querySelector('time');
  const triageDateStr = triageTimeEl && triageTimeEl.getAttribute('datetime');
  const triageDate = triageDateStr ? new Date(triageDateStr) : null;
  if (!triageDate) {
    return;
  }

  // Compute duration
  const diffMs = Math.max(0, triageDate.getTime() - submissionDate.getTime());
  const minutes = Math.floor(diffMs / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  const formatted = parts.join(' ');

  // Build indicator right below the Status span
  const indicator = document.createElement('div');
  indicator.id = 'ca-triage-time-indicator';
  indicator.textContent = `Triaged in ${formatted}`;
  indicator.title = `Submitted: ${submissionDate.toString()}\nTriaged: ${triageDate.toString()}`;
  indicator.style.marginTop = '4px';
  indicator.style.fontSize = '12px';
  indicator.style.color = '#6b7280';

  statusSpan.insertAdjacentElement('afterend', indicator);
}

function addIncludeIpButton() {
  const referenceElement = document.querySelector('#reply-form > div > div > div:nth-child(3)');

  if (referenceElement && !document.getElementById('ca-ip-feature-container')) {
    const featureContainer = document.createElement('div');
    featureContainer.id = 'ca-ip-feature-container';
    featureContainer.className = 'panel-footer'; // Use existing class for styling

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist';
    featureContainer.appendChild(label);

    const ipButton = document.createElement('button');
    ipButton.textContent = '[Include My IP]';
    ipButton.id = 'ca-include-ip-button';
    ipButton.className = 'bc-btn bc-btn--link';
    ipButton.type = 'button';
    ipButton.style.color = '#FF6900';
    ipButton.style.padding = '0';
    ipButton.style.verticalAlign = 'baseline';
    ipButton.style.marginLeft = '10px';

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

          // Use a simpler method to set the value and dispatch an event
          commentBox.value = newText;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (error) {
        console.error('CrowdAssist: Failed to fetch IP address.', error);
      }
    });

    featureContainer.appendChild(ipButton);
    referenceElement.insertAdjacentElement('afterend', featureContainer);
  }
}

function addAiReviewButton() {
  const ipFeatureContainer = document.getElementById('ca-ip-feature-container');
  
  if (ipFeatureContainer && !document.getElementById('ca-ai-review-button')) {
    const aiButton = document.createElement('button');
    aiButton.textContent = '[AI Review Text]';
    aiButton.id = 'ca-ai-review-button';
    aiButton.className = 'bc-btn bc-btn--link';
    aiButton.type = 'button';
    aiButton.style.color = '#FF6900';
    aiButton.style.padding = '0';
    aiButton.style.verticalAlign = 'baseline';
    aiButton.style.marginLeft = '10px';

    aiButton.addEventListener('click', async (event) => {
      event.preventDefault();
      
      const commentBox = document.querySelector('#create-comment-body');
      if (!commentBox || !commentBox.value.trim()) {
        alert('Please write some text in the comment box first.');
        return;
      }

      const originalText = aiButton.textContent;
      aiButton.textContent = '[Reviewing...]';
      aiButton.disabled = true;

      try {
        // Get the stored OpenAI token
        const result = await new Promise((resolve) => {
          safeStorageGet(['openai_token'], resolve);
        });

        if (!result || !result.openai_token) {
          alert('Please set your OpenAI API token in the extension popup first.');
          return;
        }

        // Get the last comment for context
        const commentElements = document.querySelectorAll('div > div.activity-block__content > div.bc-markdown.bc-markdown--image-with-cursor.bc-markdown--bordered');
        let lastComment = '';
        if (commentElements.length > 0) {
          lastComment = commentElements[commentElements.length - 1].textContent.trim();
        }

        // Prepare the user message with context
        let userMessage = `This is my response to a program/triage team request. Please clean it up while keeping the same format and approach:\n\n${commentBox.value}`;
        
        if (lastComment) {
          userMessage = `This is my response to a program/triage team request. Here's what they said:\n\n"${lastComment}"\n\nAnd here's my reply that needs cleaning up:\n\n${commentBox.value}\n\nPlease clean up my response while keeping the same format and approach.`;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.openai_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are helping a bug bounty researcher respond to program/triage team requests. The researcher is replying to specific questions or requests from the program team. Your job is to polish their response while keeping the EXACT same format and approach. Only fix grammar, spelling, and clarity issues. DO NOT add extra information, change the structure, or make it more formal. Keep the same tone and length - just make it cleaner and more professional.'
              },
              {
                role: 'user',
                content: userMessage
              }
            ],
            max_tokens: 300,
            temperature: 0.2
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        const review = data.choices[0].message.content;

        // Show the improved text using modal
        showResultModal('AI Improved Text', review, () => {
          // User wants to replace with improved text
          commentBox.value = review;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        });

      } catch (error) {
        console.error('CrowdAssist: Failed to review text:', error);
        alert(`Failed to review text: ${error.message}`);
      } finally {
        aiButton.textContent = originalText;
        aiButton.disabled = false;
      }
    });

    ipFeatureContainer.appendChild(aiButton);
  }
}

function addAutoReplyButton() {
  const ipFeatureContainer = document.getElementById('ca-ip-feature-container');
  
  if (ipFeatureContainer && !document.getElementById('ca-auto-reply-button')) {
    const autoReplyButton = document.createElement('button');
    autoReplyButton.textContent = '[Auto-Reply]';
    autoReplyButton.id = 'ca-auto-reply-button';
    autoReplyButton.className = 'bc-btn bc-btn--link';
    autoReplyButton.type = 'button';
    autoReplyButton.style.color = '#FF6900';
    autoReplyButton.style.padding = '0';
    autoReplyButton.style.verticalAlign = 'baseline';
    autoReplyButton.style.marginLeft = '10px';

    autoReplyButton.addEventListener('click', async (event) => {
      event.preventDefault();
      
      const originalText = autoReplyButton.textContent;
      autoReplyButton.textContent = '[Generating...]';
      autoReplyButton.disabled = true;

      try {
        // Get the stored OpenAI token
        const result = await new Promise((resolve) => {
          safeStorageGet(['openai_token'], resolve);
        });

        if (!result || !result.openai_token) {
          alert('Please set your OpenAI API token in the extension popup first.');
          return;
        }

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

        const userMessage = `You are helping a bug bounty researcher respond to comments from program/triage teams. Here's the latest comment from the program team:

"${lastComment}"

Please generate a professional but friendly response that:
- Acknowledges their message appropriately
- Is concise and to the point
- Uses a conversational but respectful tone
- Avoids being overly formal or robotic
- Shows engagement and willingness to help
- Is appropriate for a bug bounty platform interaction

Generate only the response text, no additional formatting or explanations.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.openai_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'user',
                content: userMessage
              }
            ],
            max_tokens: 200,
            temperature: 0.3
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        const autoReply = data.choices[0].message.content;

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
        autoReplyButton.textContent = originalText;
        autoReplyButton.disabled = false;
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
    featureContainer.style.display = 'flex';
    featureContainer.style.alignItems = 'center';
    // featureContainer.style.marginBottom = '10px';
    featureContainer.style.padding = '10px';
    // featureContainer.style.backgroundColor = '#f8f9fa';
    featureContainer.style.borderRadius = '4px';
    featureContainer.style.border = '1px solid #dee2e6';

    const label = document.createElement('span');
    label.textContent = 'CrowdAssist';
    label.style.fontWeight = 'bold';
    label.style.marginRight = '10px';
    featureContainer.appendChild(label);

    // Include My IP button
    const ipButton = document.createElement('button');
    ipButton.textContent = '[Include My IP]';
    ipButton.id = 'ca-report-creation-include-ip-button';
    ipButton.className = 'bc-btn bc-btn--link';
    ipButton.type = 'button';
    ipButton.style.color = '#FF6900';
    ipButton.style.padding = '0';
    ipButton.style.verticalAlign = 'baseline';
    ipButton.style.marginRight = '10px';

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
    const aiReviewButton = document.createElement('button');
    aiReviewButton.textContent = '[AI Review Report]';
    aiReviewButton.id = 'ca-report-creation-ai-review-button';
    aiReviewButton.className = 'bc-btn bc-btn--link';
    aiReviewButton.type = 'button';
    aiReviewButton.style.color = '#FF6900';
    aiReviewButton.style.padding = '0';
    aiReviewButton.style.verticalAlign = 'baseline';
    aiReviewButton.style.marginRight = '10px';

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

      const originalText = aiReviewButton.textContent;
      aiReviewButton.textContent = '[Reviewing...]';
      aiReviewButton.disabled = true;

      try {
        // Get the stored OpenAI token
        const result = await new Promise((resolve) => {
          safeStorageGet(['openai_token'], resolve);
        });

        if (!result || !result.openai_token) {
          alert('Please set your OpenAI API token in the extension popup first.');
          return;
        }

        const userMessage = `Please review and improve this bug bounty report. Make it more professional, clear, and well-structured while maintaining all technical details:

${descriptionField.value}

Please improve:
- Grammar and spelling
- Technical clarity and accuracy
- Structure and formatting
- Professional tone
- Remove any redundancy

Keep all technical details intact and maintain the same length roughly.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.openai_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are helping a bug bounty researcher improve their vulnerability report. Focus on clarity, professionalism, and technical accuracy while maintaining all original technical details.'
              },
              {
                role: 'user',
                content: userMessage
              }
            ],
            max_tokens: 1000,
            temperature: 0.3
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        const improvedReport = data.choices[0].message.content;

        // Show the improved report using modal
        showResultModal('AI Improved Report', improvedReport, () => {
          descriptionField.value = improvedReport;
          descriptionField.dispatchEvent(new Event('input', { bubbles: true }));
        });

      } catch (error) {
        console.error('CrowdAssist: Failed to review report:', error);
        alert(`Failed to review report: ${error.message}`);
      } finally {
        aiReviewButton.textContent = originalText;
        aiReviewButton.disabled = false;
      }
    });

    // AI Generate Report button
    const aiGenerateButton = document.createElement('button');
    aiGenerateButton.textContent = '[AI Generate Report]';
    aiGenerateButton.id = 'ca-report-creation-ai-generate-button';
    aiGenerateButton.className = 'bc-btn bc-btn--link';
    aiGenerateButton.type = 'button';
    aiGenerateButton.style.color = '#FF6900';
    aiGenerateButton.style.padding = '0';
    aiGenerateButton.style.verticalAlign = 'baseline';

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

        const originalText = aiGenerateButton.textContent;
        aiGenerateButton.textContent = '[Generating...]';
        aiGenerateButton.disabled = true;

        try {
          // Get the stored OpenAI token
          const result = await new Promise((resolve) => {
            safeStorageGet(['openai_token'], resolve);
          });

          if (!result || !result.openai_token) {
            alert('Please set your OpenAI API token in the extension popup first.');
            return;
          }

          const userMessage = `Create a vulnerability report for a ${vulnType} found on ${targetUrl}. 

If my provided URL has parameters, make sure to include them in the report.

The report should include the following structure:

**Summary:**
[Brief description of the vulnerability]

**Reproduction Steps:**
1. [Step 1]
2. [Step 2]
3. [Continue with clear, numbered steps]

**Impact:**
[Explain the potential impact and risk, don't overcomplicate the language and don't talk about compliance or legal implications]

**Fix Recommendations:**
[Provide simple and clear remediation steps]

Requirements:
- Keep it clear and direct
- Don't add dates or timestamps
- Don't overcomplicate the language
- Focus on technical accuracy
- Make reproduction steps easy to follow
- Provide realistic impact assessment
- Give actionable fix recommendations`;

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${result.openai_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: 'You are a cybersecurity expert helping create vulnerability reports for bug bounty programs. Create clear, professional, and technically accurate reports that follow industry standards. Focus on practical reproduction steps and realistic impact assessments.'
                },
                {
                  role: 'user',
                  content: userMessage
                }
              ],
              max_tokens: 800,
              temperature: 0.4
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
          }

          const data = await response.json();
          const generatedReport = data.choices[0].message.content;

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
          aiGenerateButton.textContent = originalText;
          aiGenerateButton.disabled = false;
        }
      });
    });

    featureContainer.appendChild(ipButton);
    featureContainer.appendChild(aiReviewButton);
    featureContainer.appendChild(aiGenerateButton);
    
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

// Listen for storage changes to update privacy mode in real-time
try {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.storage.onChanged.addListener(function(changes, namespace) {
      if (changes.privacy_mode) {
        applyPrivacyMode();
      }
      if (changes.theme_mode) {
        // Theme changed - could update any open modals here if needed
        console.log('CrowdAssist: Theme mode changed to', changes.theme_mode.newValue);
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
        console.log('CrowdAssist: System theme changed to', e.matches ? 'dark' : 'light');
        // Theme changed - could update any open modals here if needed
      }
    });
  });
}

function init() {
  // Apply privacy mode
  applyPrivacyMode();
  
  // Add buttons based on page type
  if (isReportCreationPage()) {
    // Report creation pages: /engagements/.../submissions/new or /engagements/.../submissions/UUID/edit
    addReportCreationButtons();
  } else if (isReportVisualizationPage()) {
    // Report visualization pages: /submissions/UUID
    addCopyButton();
    addTriagedTimeIndicator();
    addIncludeIpButton();
    addAiReviewButton();
    addAutoReplyButton();
  } else {
    // Regular comment/interaction pages
    addCopyButton();
    addIncludeIpButton();
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