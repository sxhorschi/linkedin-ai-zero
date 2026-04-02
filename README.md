# LinkedIn AI Detector

Chrome Extension (Manifest V3) that adds a "Check AI" button to LinkedIn posts. One click scores how likely a post was written by AI (0-100%), powered by Claude Haiku. Sign in with your Claude account -- no API key needed.

## Features

- 🤖 **One-click detection** -- "Check AI" button injected directly into LinkedIn's action bar (next to Like, Comment, Share)
- 🔐 **Claude OAuth login** -- Sign in with your Claude Pro/Max subscription, no API key required
- 📊 **Color-coded scores** -- Red (>=70%), Orange (>=40%), Green (<40%)
- 💬 **Hover for explanation** -- Tooltip shows the reasoning behind the score
- ♾️ **Infinite scroll support** -- MutationObserver picks up new posts as you scroll
- 🔄 **Auto token refresh** -- OAuth tokens refresh automatically in the background

## Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/sxhorschi/linkedin-ai-zero.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned folder
5. Click the extension icon and sign in with your Claude account

## Usage

1. Click the extension icon and hit **"Sign in with Claude"**
2. Authorize in the browser popup (uses your Claude Pro/Max subscription)
3. Navigate to [linkedin.com/feed](https://www.linkedin.com/feed)
4. Each post now has a **🤖 Check AI** button in the action bar
5. Click it -- the button shows a loading state, then displays the score (e.g. "87% AI")
6. Hover over the score to see the AI's reasoning

## How It Works

The extension uses OAuth 2.0 with PKCE to authenticate with your Claude account. No API key is needed -- it uses your existing Pro/Max subscription.

1. **Login** -- OAuth PKCE flow via `chrome.identity.launchWebAuthFlow()`
2. **Token management** -- Background service worker handles token storage and auto-refresh
3. **Detection** -- Content script extracts post text, calls Claude Haiku via `Authorization: Bearer` token
4. **Display** -- Score shown inline with color coding

## Project Structure

```
├── manifest.json   # MV3 extension config
├── background.js   # OAuth flow, token management, message handler
├── content.js      # Feed observer + button injection + API calls
├── styles.css      # LinkedIn-native button styles
├── popup.html      # Login/logout UI
├── popup.js        # Auth state management
└── icons/          # Extension icons (16/48/128px)
```

## Troubleshooting

**Buttons not appearing?**
LinkedIn periodically changes CSS class names. Inspect a post's action bar and update the selectors in `findActionBar()` and `findPosts()` in `content.js`.

**"Login first" error?**
Click the extension icon and sign in with your Claude account. You need an active Pro or Max subscription.

**Token expired?**
Tokens refresh automatically. If you see errors, try signing out and back in via the extension popup.

## Requirements

- Google Chrome (or Chromium-based browser)
- Claude Pro or Max subscription

## Model

Uses `claude-haiku-4-5-20251001` -- fast and cost-effective for per-post checks.

## License

MIT
