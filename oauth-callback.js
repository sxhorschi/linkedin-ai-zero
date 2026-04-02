// Content script that runs on the Anthropic OAuth callback page.
// The page is a React SPA that displays the auth code for CLI copy-paste.
// We extract it automatically and send it to the background script.

(() => {
  function sendCode(code) {
    // Strip #state suffix if present
    if (code.includes("#")) code = code.split("#")[0];
    if (!code || code.length < 5) return false;

    chrome.runtime.sendMessage({ type: "oauthCallback", code }, (res) => {
      if (res?.success) {
        document.title = "Authorized — closing…";
        setTimeout(() => { try { window.close(); } catch {} }, 500);
      }
    });
    return true;
  }

  // Method 1: Check URL query params
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get("code");
  if (urlCode && sendCode(urlCode)) return;

  // Method 2: Check URL hash fragment
  if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    if (hash.includes("=")) {
      const hashCode = new URLSearchParams(hash).get("code");
      if (hashCode && sendCode(hashCode)) return;
    } else if (hash.length > 5) {
      if (sendCode(hash)) return;
    }
  }

  // Method 3: Watch DOM for the code (React SPA — needs MutationObserver)
  let found = false;

  function tryExtractFromDOM() {
    if (found) return;

    // Try specific elements first
    const selectors = [
      "code",
      "pre",
      "input[readonly]",
      "input[type='text']",
      '[data-testid="code"]',
      '[data-testid="auth-code"]',
      ".font-mono",
      "[class*='mono']",
      "[class*='code']",
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = (el.value || el.textContent || "").trim();
      if (text && text.length > 10) {
        found = true;
        sendCode(text);
        return;
      }
    }

    // Fallback: scan all text on the page for something that looks like
    // an auth code (long alphanumeric string, possibly with #state)
    const body = document.body?.innerText || "";
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Auth codes are typically long base64-ish strings
      if (line.length > 20 && line.length < 2000 && /^[A-Za-z0-9_\-#+=/.]+$/.test(line)) {
        found = true;
        sendCode(line);
        return;
      }
    }
  }

  // Try immediately (in case SSR)
  if (document.readyState !== "loading") {
    tryExtractFromDOM();
  }

  // Watch for DOM changes (React hydration)
  if (!found) {
    const observer = new MutationObserver(() => {
      tryExtractFromDOM();
      if (found) observer.disconnect();
    });

    // Start observing as soon as body exists
    function startObserving() {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        // Also try after a short delay in case React has already rendered
        setTimeout(tryExtractFromDOM, 500);
        setTimeout(tryExtractFromDOM, 1500);
        setTimeout(tryExtractFromDOM, 3000);
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
          tryExtractFromDOM();
        });
      }
    }

    startObserving();

    // Stop after 30s
    setTimeout(() => {
      observer.disconnect();
    }, 30000);
  }
})();
