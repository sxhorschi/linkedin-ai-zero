# LinkedIn AI Detector

Chrome Extension (Manifest V3) that adds a "Check AI" button to LinkedIn posts. One click scores how likely a post was written by AI (0–100%), powered by Claude Haiku.

## Features

- 🤖 **One-click detection** — "Check AI" button injected directly into LinkedIn's action bar (next to Like, Comment, Share)
- 📊 **Color-coded scores** — Red (≥70%), Orange (≥40%), Green (<40%)
- 💬 **Hover for explanation** — Tooltip shows the reasoning behind the score
- ♾️ **Infinite scroll support** — MutationObserver picks up new posts as you scroll
- 🔒 **API key stored locally** — Saved via `chrome.storage.local`, never leaves your browser

## Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/sxhorschi/linkedin-ai-zero.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned folder
5. Click the extension icon and enter your [Anthropic API key](https://console.anthropic.com/)

## Usage

1. Navigate to [linkedin.com/feed](https://www.linkedin.com/feed)
2. Each post now has a **🤖 Check AI** button in the action bar
3. Click it — the button shows a loading state, then displays the score (e.g. "87% AI")
4. Hover over the score to see the AI's reasoning

## How It Works

The content script uses a `MutationObserver` to watch the LinkedIn feed for new posts. For each post, it:

1. Locates the action bar (Like/Comment/Share)
2. Injects a native-looking "Check AI" button
3. On click, extracts the post text and sends it to `claude-haiku-4-5-20251001`
4. Displays the AI probability score inline with color coding

## Project Structure

```
├── manifest.json   # MV3 extension config
├── content.js      # Feed observer + button injection + API calls
├── styles.css      # LinkedIn-native button styles
├── popup.html      # API key settings UI
├── popup.js        # Settings logic
└── icons/          # Extension icons (16/48/128px)
```

## Troubleshooting

**Buttons not appearing?**
LinkedIn periodically changes CSS class names. Inspect a post's action bar and update the selectors in `findActionBar()` and `findPosts()` in `content.js`.

**API errors?**
Make sure your Anthropic API key is valid and has credits. Click the extension icon to check/update it.

## Model

Uses `claude-haiku-4-5-20251001` — fast and cost-effective for per-post checks. Requires the `anthropic-dangerous-direct-browser-access: true` header for browser-based API calls.

## License

MIT
