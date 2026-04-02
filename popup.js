const keyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

// Load existing key
chrome.storage.local.get("apiKey", ({ apiKey }) => {
  if (apiKey) {
    keyInput.value = apiKey;
    statusEl.textContent = "Key saved ✓";
    statusEl.className = "status status--ok";
  }
});

saveBtn.addEventListener("click", () => {
  const key = keyInput.value.trim();
  if (!key) {
    statusEl.textContent = "Please enter a valid API key";
    statusEl.className = "status status--err";
    return;
  }
  chrome.storage.local.set({ apiKey: key }, () => {
    statusEl.textContent = "Key saved ✓";
    statusEl.className = "status status--ok";
  });
});
