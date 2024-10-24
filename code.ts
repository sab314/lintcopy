// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).


// Show the HTML page in "ui.html".
figma.showUI(__html__, { width: 500, height: 400 });

// Command to handle UI messages
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'save-urls') {
    // Save both GitHub and GitLab URLs to clientStorage
    await figma.clientStorage.setAsync('githubUrl', msg.githubUrl);
    await figma.clientStorage.setAsync('gitlabUrl', msg.gitlabUrl);
    figma.notify('URLs saved!');
  }

  if (msg.type === 'get-urls') {
    // Retrieve the saved GitHub and GitLab URLs from clientStorage
    const githubUrl = await figma.clientStorage.getAsync('githubUrl');
    const gitlabUrl = await figma.clientStorage.getAsync('gitlabUrl');
    figma.ui.postMessage({ type: 'load-urls', githubUrl, gitlabUrl });
  }

  if (msg.type === 'lint') {
    // Get the saved GitHub and GitLab URLs for the word list
    const githubUrl = await figma.clientStorage.getAsync('githubUrl');
    const gitlabUrl = await figma.clientStorage.getAsync('gitlabUrl');
    
    const wordListUrl = githubUrl || gitlabUrl; // Use whichever URL is present
    if (!wordListUrl) {
      figma.notify('No word list URL found. Enter and save a URL.');
      return;
    }

    // Fetch the word list from the URL
    const customWordList = await fetchWordList(wordListUrl);
    if (!customWordList || Object.keys(customWordList).length === 0) {
      figma.notify('Failed to fetch or load the word list. Check the URL.');
      return;
    }

    // Perform linting on selected text layers
    const selectedTextLayers = figma.currentPage.selection.filter(node => node.type === 'TEXT');
    
    if (selectedTextLayers.length === 0) {
      figma.notify('Select text layers and check copy again.');
      return;
    }

    // Lint the text in each selected text layer
    const lintResults = selectedTextLayers.map((layer: TextNode) => {
      const text = layer.characters;
      const errors = lintText(text, customWordList); // Pass customWordList to lintText
      return { name: layer.name, errors, id: layer.id }; // Use layer.name and layer.id
    });

    // Send linting results back to the UI
    figma.ui.postMessage({ type: 'lint-results', results: lintResults });
    console.log(lintResults); // Verify what it's sending
  }

  if (msg.type === 'select-layer') {
    // Select and zoom to the corresponding layer
    const layer = figma.currentPage.findOne(node => node.id === msg.id);
    if (layer) {
      figma.currentPage.selection = [layer];
      figma.viewport.scrollAndZoomIntoView([layer]);
    }
  }

};

// Function to fetch the word list from a user-defined URL
async function fetchWordList(url: string): Promise<Record<string, string>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch word list');
    }
    const wordList: Record<string, string> = await response.json();
    return wordList;
  } catch (error) {
    console.error('Error fetching word list:', error);
    return {}; // Return an empty object if there was an error
  }
}

// LINT functions //

// Function to lint text for all rules
function lintText(text: string, wordList: Record<string, string>) {  // Add wordList as an argument
  const errors: string[] = [];

  // Capitalization and spelling check
  if (!text.match(/^[A-Z]/)) {
    errors.push("Text should start with a capital letter.");
  }

  if (text.match(/\b(teh|recieve)\b/)) {
    errors.push("Spelling error: common misspelling.");
  }

  // Call the function to check for word replacements, pass the wordList
  const wordReplacementErrors = lintTextForWordReplacements(text, wordList);
  errors.push(...wordReplacementErrors);

  // Detect Title Case and suggest Sentence Case
  const titleCaseErrors = detectTitleCase(text);
  errors.push(...titleCaseErrors);

  return errors;
}

// Function to lint text for specific word replacements using the fetched word list
function lintTextForWordReplacements(text: string, wordList: Record<string, string>) {
  const errors: string[] = [];

  // Iterate over each word/phrase in the word list
  for (const [badWord, replacement] of Object.entries(wordList)) {
    // Use a regular expression to search for multi-word phrases and individual words
    const regex = new RegExp(`\\b${badWord}\\b`, 'gi'); // 'gi' for case-insensitive match

    // Check if the text contains the phrase or word
    if (regex.test(text)) {
      errors.push(`Found "${badWord}": ${replacement}`);
    }
  }

  return errors;
}


// Function to detect Title Case and suggest correction to Sentence Case across multiple sentences
function detectTitleCase(text: string) {
  const errors: string[] = [];
  
  // Split the text into sentences based on punctuation marks (e.g., ., ?, !)
  const sentences = text.split(/(?<=[.!?])\s+/); // Split by sentence-ending punctuation followed by spaces

  // Loop through each sentence
  sentences.forEach(sentence => {
    const words = sentence.split(' ').filter(word => word.length > 0); // Split sentence into words, remove empty strings

    if (words.length < 2) {
      return; // If there's only one word, skip the check
    }

    // Loop through words starting from the second word in each sentence
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      // Check if the word is capitalized (in Title Case) when it shouldn't be
      if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
        errors.push(`Use sentence case. "${word}" in sentence "${sentence.trim()}" is in title case.`);
      }
    }
  });

  return errors;
}
