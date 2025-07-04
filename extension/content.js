// This script will be injected into the page
console.log("CrowdAssist content script loaded.");

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
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('turndown.js');
  script.onload = callback;
  document.head.appendChild(script);
}

function copyReportAsMarkdown() {
  const button = document.getElementById('ca-copy-markdown-button');
  const originalText = button.querySelector('span:last-child').textContent;

  const turndownService = new TurndownService();
  const submissionElement = document.querySelector('.bc-helper-nopadding');

  if (submissionElement) {
    // Clone the element and remove the button from the clone to prevent it from being copied
    const submissionClone = submissionElement.cloneNode(true);
    const buttonInClone = submissionClone.querySelector('#ca-copy-markdown-button');
    if (buttonInClone) {
      buttonInClone.remove();
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
  if (targetArea && !document.getElementById('ca-copy-markdown-button')) {
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
    copyButton.style.marginBottom = '5px';
    copyButton.addEventListener('click', copyReportAsMarkdown);
    
    targetArea.prepend(copyButton);
  }
}

function init() {
  addCopyButton();
  
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