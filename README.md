# SummarizeGPT - Firefox Extension

A Firefox extension that uses OpenAI's GPT to summarize web pages and answer questions about their content.

## Features

- 🚀 Quick summaries of web pages
- 💬 Ask follow-up questions about the page content
- ⚙️ Customizable settings:
  - Choose between GPT-3.5 and GPT-4 models
  - Adjust response length and style
  - Control automatic processing
  - Cache results for faster access

## Installation

1. Download or clone this repository
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension folder and select `manifest.json`

## Setup

1. Get an OpenAI API key from [OpenAI's website](https://platform.openai.com/api-keys)
2. Click the extension icon in your Firefox toolbar
3. Go to the "API Key" tab
4. Enter your OpenAI API key

## Usage

1. Navigate to any webpage you want to summarize
2. Click the extension icon in your toolbar
3. Get an instant summary of the page's beginning
4. Enable "Auto-process full page" in settings for complete page analysis
5. Ask follow-up questions about any part of the content

## Settings

### Model Selection

- GPT-3.5 Turbo: Faster and more cost-effective
- GPT-4: More accurate but more expensive

### Response Length

- Adjust token length for different levels of detail
- Options from brief (150 tokens) to detailed (1000 tokens)

### Processing Options

- Auto-process: Analyze the entire page automatically
- Cache results: Save summaries for faster future access

## Privacy

- All processing is done through OpenAI's API
- Your API key is stored locally in your browser
- No data is collected or stored externally
- Cached results are stored locally and can be cleared at any time

## Requirements

- Firefox browser
- OpenAI API key
- Active internet connection

## Known Limitations

- Very long pages are processed in chunks
- Some dynamic content may not be captured
- Processing time depends on page length and API response time

## Contributing

Feel free to submit issues and enhancement requests!

## License

[Add your chosen license here]
