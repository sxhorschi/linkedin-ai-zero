// Content script that runs on the Anthropic OAuth callback page.
// Extracts the authorization code from the URL and sends it to
// the background script, which exchanges it for tokens.

(() => {
  const url = window.location.href;

  // Extract code from query params, hash, or page content
  let code = null;

  // Try query parameter first
  const params = new URLSearchParams(window.location.search);
  code = params.get("code");

  // Try hash fragment — Anthropic sometimes returns code#state
  if (!code && window.location.hash) {
    const hash = window.location.hash.substring(1);
    // Could be just the raw code, or code#state, or key=value pairs
    if (hash.includes("=")) {
      const hashParams = new URLSearchParams(hash);
      code = hashParams.get("code");
    } else {
      // Raw code or code#state
      code = hash.split("#")[0] || hash;
    }
  }

  if (code) {
    // Strip any #state suffix
    if (code.includes("#")) code = code.split("#")[0];

    chrome.runtime.sendMessage({ type: "oauthCallback", code }, (res) => {
      if (res?.success) {
        // Show a brief success message then close
        document.title = "Authorized — closing…";
        try { window.close(); } catch {}
      }
    });
    return;
  }

  // If code wasn't in the URL, wait for the page to load and try to
  // extract it from the displayed content (CLI-style callback page)
  const observer = new MutationObserver(() => {
    // Look for a code displayed on the page — usually in a <code>, <pre>,
    // or input element
    const codeEl =
      document.querySelector("code") ||
      document.querySelector("pre") ||
      document.querySelector('input[readonly]') ||
      document.querySelector('[data-testid="code"]');

    if (codeEl) {
      const text = (codeEl.value || codeEl.textContent || "").trim();
      if (text && text.length > 10) {
        observer.disconnect();
        let extracted = text;
        if (extracted.includes("#")) extracted = extracted.split("#")[0];

        chrome.runtime.sendMessage({ type: "oauthCallback", code: extracted }, (res) => {
          if (res?.success) {
            document.title = "Authorized — closing…";
            try { window.close(); } catch {}
          }
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Safety timeout — stop watching after 30s
  setTimeout(() => observer.disconnect(), 30000);
})();
