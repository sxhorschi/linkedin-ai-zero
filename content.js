(() => {
  const PROCESSED_ATTR = "data-ai-check-injected";

  function findPosts() {
    return document.querySelectorAll(
      `.feed-shared-update-v2:not([${PROCESSED_ATTR}])`
    );
  }

  function findActionBar(postEl) {
    return (
      postEl.querySelector(".feed-shared-social-action-bar") ||
      postEl.querySelector(
        '[class*="social-actions"] ul, [class*="social-action-bar"]'
      )
    );
  }

  function extractPostText(postEl) {
    const textEl =
      postEl.querySelector(".feed-shared-update-v2__description") ||
      postEl.querySelector('[class*="update-components-text"]') ||
      postEl.querySelector(".break-words");
    if (!textEl) return "";
    return textEl.innerText.trim();
  }

  async function detectAI(text, apiKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Analyze the following LinkedIn post and estimate the probability (0-100) that it was written by an AI language model rather than a human. Consider factors like: generic phrasing, buzzword density, lack of personal voice, formulaic structure, and overly polished tone.

Respond ONLY with valid JSON: {"score": <number 0-100>, "reason": "<one sentence explanation>"}

Post:
"""
${text}
"""`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    return JSON.parse(content);
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.className = "ai-check-btn artdeco-button artdeco-button--muted artdeco-button--tertiary";
    btn.type = "button";
    btn.innerHTML = `
      <span class="ai-check-btn__icon">🤖</span>
      <span class="ai-check-btn__label">Check AI</span>
    `;
    return btn;
  }

  function injectButton(postEl) {
    const actionBar = findActionBar(postEl);
    if (!actionBar) return;

    const text = extractPostText(postEl);
    if (!text || text.length < 20) return;

    postEl.setAttribute(PROCESSED_ATTR, "true");

    const btn = createButton();
    const wrapper = document.createElement("li");
    wrapper.className = "ai-check-btn__wrapper";
    wrapper.appendChild(btn);
    actionBar.appendChild(wrapper);

    btn.addEventListener("click", async () => {
      const labelEl = btn.querySelector(".ai-check-btn__label");

      const stored = await chrome.storage.local.get("apiKey");
      if (!stored.apiKey) {
        labelEl.textContent = "Set API key →";
        btn.classList.add("ai-check-btn--error");
        return;
      }

      btn.disabled = true;
      btn.classList.remove("ai-check-btn--error", "ai-check-btn--done");
      labelEl.textContent = "Checking…";

      try {
        const result = await detectAI(text, stored.apiKey);
        const score = Math.round(result.score);
        labelEl.textContent = `${score}% AI`;
        btn.title = result.reason;
        btn.classList.add("ai-check-btn--done");

        if (score >= 70) btn.classList.add("ai-check-btn--high");
        else if (score >= 40) btn.classList.add("ai-check-btn--medium");
        else btn.classList.add("ai-check-btn--low");
      } catch (err) {
        labelEl.textContent = "Error";
        btn.classList.add("ai-check-btn--error");
        btn.title = err.message;
        console.error("[AI Detector]", err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function scanFeed() {
    const posts = findPosts();
    posts.forEach(injectButton);
  }

  // Initial scan + MutationObserver for infinite scroll
  scanFeed();

  const observer = new MutationObserver(() => scanFeed());
  observer.observe(document.body, { childList: true, subtree: true });
})();
