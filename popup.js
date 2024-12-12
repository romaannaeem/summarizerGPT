document.addEventListener('DOMContentLoaded', async () => {
  const apiKeySection = document.getElementById('apiKeySection');
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyButton = document.getElementById('saveKey');
  const loadingDiv = document.getElementById('loading');
  const errorDiv = document.getElementById('error');
  const summaryDiv = document.getElementById('summary');
  const followupSection = document.getElementById('followupSection');
  const followupInput = document.getElementById('followupInput');
  const askFollowupButton = document.getElementById('askFollowup');
  const followupResponse = document.getElementById('followupResponse');

  let pageContent = ''; // Store page content for follow-up questions
  let currentSummary = ''; // Store current summary for context
  let processedChunks = 0;
  let totalChunks = 0;
  let isFullyProcessed = false;
  let currentUrl = '';

  const DEFAULT_SETTINGS = {
    model: 'gpt-3.5-turbo',
    maxTokens: 250,
    temperature: 0.3,
    autoProcess: true,
    cacheResults: true,
  };

  // Check for API key
  const result = await browser.storage.local.get('openaiApiKey');
  if (!result.openaiApiKey) {
    apiKeySection.style.display = 'block';
    saveKeyButton.addEventListener('click', async () => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        await browser.storage.local.set({ openaiApiKey: apiKey });
        apiKeySection.style.display = 'none';
        summarizePage();
      }
    });
  } else {
    summarizePage();
  }

  // Handle follow-up questions
  askFollowupButton.addEventListener('click', async () => {
    const question = followupInput.value.trim();
    if (question) {
      await askFollowUpQuestion(question);
      followupInput.value = ''; // Clear input after asking
    }
  });

  // Also handle Enter key in the input
  followupInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const question = followupInput.value.trim();
      if (question) {
        await askFollowUpQuestion(question);
        followupInput.value = '';
      }
    }
  });

  // Add tab handling
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach((content) => {
        content.classList.remove('active');
      });
      document.getElementById(`${tab.dataset.tab}Tab`).classList.add('active');

      // If switching to settings tab, show current API key
      if (tab.dataset.tab === 'settings') {
        showCurrentApiKey();
      }
    });
  });

  // Settings tab functionality
  const newApiKeyInput = document.getElementById('newApiKey');
  const updateApiKeyButton = document.getElementById('updateApiKey');
  const currentApiKeyDiv = document.getElementById('currentApiKey');

  async function showCurrentApiKey() {
    const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');
    if (openaiApiKey) {
      // Show only first and last 4 characters
      currentApiKeyDiv.textContent = `${openaiApiKey.substring(0, 4)}...${openaiApiKey.slice(-4)}`;
    } else {
      currentApiKeyDiv.textContent = 'No API key set';
    }
  }

  updateApiKeyButton.addEventListener('click', async () => {
    const newKey = newApiKeyInput.value.trim();
    if (newKey) {
      await browser.storage.local.set({ openaiApiKey: newKey });
      newApiKeyInput.value = '';
      showCurrentApiKey();
      alert('API key updated successfully!');
    }
  });

  // Modify the content extraction to handle the full page
  async function getPageContent(tab) {
    const [content] = await browser.tabs.executeScript(tab.id, {
      code: `
        function extractContent() {
          // Get all text-containing elements
          const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article, section, div');
          let content = '';
          
          function isVisible(element) {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   element.offsetWidth > 0 &&
                   element.offsetHeight > 0;
          }

          function hasUsefulContent(element) {
            // Skip elements that are likely navigation, footer, etc.
            const excludeClasses = ['nav', 'footer', 'header', 'menu', 'sidebar', 'comment'];
            const classStr = element.className.toLowerCase();
            return !excludeClasses.some(cls => classStr.includes(cls));
          }

          for (const element of textElements) {
            // Only process visible elements with meaningful content
            if (isVisible(element) && hasUsefulContent(element)) {
              const text = element.textContent.trim();
              if (text.length > 20) { // Skip very short snippets
                content += text + '\\n\\n';
              }
            }
          }
          
          return content.trim();
        }
        extractContent();
      `,
    });
    return content;
  }

  // Add this function to check for existing results
  async function checkExistingResults() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    currentUrl = tabs[0].url;

    const result = await browser.storage.local.get(currentUrl);
    if (result[currentUrl]) {
      const data = result[currentUrl];

      // Restore the processing state
      processedChunks = data.processedChunks;
      totalChunks = data.totalChunks;
      isFullyProcessed = data.isFullyProcessed;
      pageContent = data.pageContent;
      currentSummary = data.currentSummary;

      // Update UI with existing data
      if (data.quickPreview) {
        summaryDiv.innerHTML = `<div style="border-left: 3px solid #0060df; padding: 0 0 0 10px; margin: 0 0 15px 0;">
<strong>Quick Summary</strong>:<br>
${data.quickPreview}
</div>`;

        followupSection.style.display = 'block';
      }

      // If still processing, restart from where we left off
      if (!data.isFullyProcessed) {
        const processingStatus = document.getElementById('processingStatus');
        processingStatus.style.display = 'block';
        continueProcessing(data.chunks, data.summaries, data.processedChunks);
      }

      return true;
    }
    return false;
  }

  // Modify summarizePage to handle longer content
  async function summarizePage() {
    try {
      loadingDiv.style.display = 'block';
      errorDiv.style.display = 'none';
      summaryDiv.textContent = '';

      const settings = await getSettings();
      const processingStatus = document.getElementById('processingStatus');
      processingStatus.style.display = 'none'; // Hide by default

      // Check for existing results first
      const hasExisting = await checkExistingResults();
      if (hasExisting) {
        loadingDiv.style.display = 'none';
        return;
      }

      const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');
      if (!openaiApiKey) {
        throw new Error('No API key found');
      }

      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const fullContent = await getPageContent(tabs[0]);
      pageContent = fullContent;

      const chunks = fullContent.match(/[\s\S]{1,4000}/g) || [];
      totalChunks = chunks.length;
      processedChunks = 0;

      // Show quick preview first
      const quickResponse = await makeApiCall([
        {
          role: 'system',
          content: 'Provide a quick initial summary of this content.',
        },
        {
          role: 'user',
          content: `Quickly summarize this opening section: ${chunks[0]}`,
        },
      ]);

      summaryDiv.innerHTML = `<div style="border-left: 3px solid #0060df; padding: 0 0 0 10px; margin: 0 0 15px 0;">
<strong>Quick Summary</strong>:<br>
${quickResponse.choices[0].message.content}
</div>
<div id="fullSummary">${
        settings.autoProcess
          ? 'Processing remaining content in background...'
          : '<div style="color: #666; font-size: 12px; margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px;">💡 Tip: Enable "Auto-process full page" in Settings to analyze the entire page for more comprehensive summaries and better follow-up responses.</div>'
      }</div>`;

      followupSection.style.display = 'block';

      // Only show and update processing status if autoProcess is enabled
      if (settings.autoProcess) {
        processingStatus.style.display = 'block';
        await continueProcessing(chunks, [quickResponse.choices[0].message.content], 1);
      } else {
        // Make sure processing status stays hidden
        processingStatus.style.display = 'none';
        // Store only the first chunk results if caching is enabled
        if (settings.cacheResults) {
          await browser.storage.local.set({
            [currentUrl]: {
              quickPreview: quickResponse.choices[0].message.content,
              chunks: [chunks[0]],
              summaries: [quickResponse.choices[0].message.content],
              processedChunks: 1,
              totalChunks: 1,
              isFullyProcessed: true,
              pageContent: chunks[0],
              currentSummary: quickResponse.choices[0].message.content,
              timestamp: Date.now(),
            },
          });
        }
      }
    } catch (error) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = `Error: ${error.message}`;
    } finally {
      loadingDiv.style.display = 'none';
    }
  }

  // Add this new function for background processing
  async function continueProcessing(chunks, summaries, startFrom) {
    const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');
    const processingStatus = document.getElementById('processingStatus');
    const progressBar = document.getElementById('progressBar');
    const processedCount = document.getElementById('processedCount');
    const estimatedTime = document.getElementById('estimatedTime');
    const statusText = document.getElementById('statusText');
    const batchSize = 3;

    for (let i = startFrom; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      statusText.textContent = 'Processing additional content...';

      const batchPromises = batch.map((chunk) =>
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'Extract key information from this section of text.',
              },
              {
                role: 'user',
                content: `Summarize the key points from this section: ${chunk}`,
              },
            ],
            max_tokens: 250,
            temperature: 0.7,
          }),
        }).then((r) => r.json())
      );

      const batchResults = await Promise.all(batchPromises);
      summaries.push(...batchResults.map((data) => data.choices[0].message.content));

      processedChunks += batch.length;
      const progress = (processedChunks / totalChunks) * 100;
      progressBar.style.width = `${progress}%`;
      processedCount.textContent = `${processedChunks}/${totalChunks} sections`;
      estimatedTime.textContent = `Est. ${Math.ceil((totalChunks - processedChunks) * 2)} seconds`;

      // Save progress
      await browser.storage.local.set({
        [currentUrl]: {
          quickPreview: summaries[0],
          chunks,
          summaries,
          processedChunks,
          totalChunks,
          isFullyProcessed: false,
          pageContent,
          currentSummary: summaries[0],
        },
      });
    }

    // Final summary
    statusText.textContent = 'Creating final summary...';
    const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Create a coherent summary from multiple sections.',
          },
          {
            role: 'user',
            content: `Combine these summaries into one comprehensive overview:\n\n${summaries.join('\n\n')}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const finalData = await finalResponse.json();
    currentSummary = finalData.choices[0].message.content;

    document.getElementById('fullSummary').innerHTML = `<strong>Full Page Summary:</strong><br>${currentSummary}`;

    // Save final state
    await browser.storage.local.set({
      [currentUrl]: {
        quickPreview: summaries[0],
        chunks,
        summaries,
        processedChunks: totalChunks,
        totalChunks,
        isFullyProcessed: true,
        pageContent,
        currentSummary,
      },
    });

    isFullyProcessed = true;
    // Hide the processing status when complete
    if (processingStatus) {
      processingStatus.style.display = 'none';
    }
  }

  // Modify askFollowUpQuestion to handle partial processing
  async function askFollowUpQuestion(question) {
    try {
      loadingDiv.style.display = 'block';
      errorDiv.style.display = 'none';
      followupResponse.textContent = '';

      const settings = await getSettings();
      const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');

      let prompt;
      if (!settings.autoProcess) {
        prompt = `Based on the initial section of the page, please answer this question (note: only the beginning of the page has been processed): ${question}`;
      } else if (!isFullyProcessed) {
        prompt = `Based on the content processed so far, please answer this question (note: full page processing is still ongoing): ${question}`;
      } else {
        prompt = `Here is the content of a webpage: ${pageContent}\n\nHere is a summary of that content: ${currentSummary}\n\nPlease answer this question about the content: ${question}`;
      }

      const response = await makeApiCall([
        {
          role: 'system',
          content: 'You are a helpful assistant answering questions about a webpage.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      followupResponse.textContent = response.choices[0].message.content;

      if (!settings.autoProcess) {
        followupResponse.textContent +=
          '\n\n📝 Note: Only partial page was analyzed. Enable "Auto-process full page" in Settings for more comprehensive answers.';
      } else if (!isFullyProcessed) {
        followupResponse.textContent +=
          '\n\n⏳ Note: Full page processing is still ongoing. More complete answers will be available once processing is finished.';
      }
    } catch (error) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = `Error: ${error.message}`;
    } finally {
      loadingDiv.style.display = 'none';
    }
  }

  // Add this function to handle settings
  async function initializeSettings() {
    const result = await browser.storage.local.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;

    // Set initial values
    document.getElementById('modelSelect').value = settings.model;
    document.getElementById('tokenSelect').value = settings.maxTokens;
    document.getElementById('temperatureSelect').value = settings.temperature;
    document.getElementById('autoProcess').checked = settings.autoProcess;
    document.getElementById('cacheResults').checked = settings.cacheResults;

    // Add event listeners
    ['modelSelect', 'tokenSelect', 'temperatureSelect'].forEach((id) => {
      document.getElementById(id).addEventListener('change', saveSettings);
    });

    ['autoProcess', 'cacheResults'].forEach((id) => {
      document.getElementById(id).addEventListener('change', saveSettings);
    });

    document.getElementById('clearCache').addEventListener('click', async () => {
      const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');
      const { settings } = await browser.storage.local.get('settings');

      // Clear storage but keep API key and settings
      await browser.storage.local.clear();
      await browser.storage.local.set({
        openaiApiKey,
        settings,
      });

      alert('Cache cleared successfully!');
    });
  }

  // Add function to save settings
  async function saveSettings() {
    const settings = {
      model: document.getElementById('modelSelect').value,
      maxTokens: parseInt(document.getElementById('tokenSelect').value),
      temperature: parseFloat(document.getElementById('temperatureSelect').value),
      autoProcess: document.getElementById('autoProcess').checked,
      cacheResults: document.getElementById('cacheResults').checked,
    };

    await browser.storage.local.set({ settings });
  }

  // Add function to get current settings
  async function getSettings() {
    const result = await browser.storage.local.get('settings');
    return result.settings || DEFAULT_SETTINGS;
  }

  // Modify the API calls to use settings
  async function makeApiCall(messages) {
    const settings = await getSettings();
    const { openaiApiKey } = await browser.storage.local.get('openaiApiKey');

    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
      }),
    }).then((r) => r.json());
  }

  // Initialize settings
  await initializeSettings();
});
