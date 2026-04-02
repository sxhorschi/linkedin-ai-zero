const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const loggedOutEl = document.getElementById("logged-out");
const loggedInEl = document.getElementById("logged-in");
const statusEl = document.getElementById("status");
const updateBanner = document.getElementById("update-banner");
const updateVersion = document.getElementById("update-version");
const updateApplyBtn = document.getElementById("update-apply");
const checkUpdateBtn = document.getElementById("check-update");
const currentVersionEl = document.getElementById("current-version");

// Show current version
const manifest = chrome.runtime.getManifest();
currentVersionEl.textContent = `v${manifest.version}`;

// --- Auth UI ---

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = `status${type ? ` status--${type}` : ""}`;
}

function showLoggedIn() {
  loggedOutEl.classList.add("hidden");
  loggedInEl.classList.remove("hidden");
  setStatus("Connected", "ok");
}

function showLoggedOut() {
  loggedInEl.classList.add("hidden");
  loggedOutEl.classList.remove("hidden");
  setStatus("", "");
}

chrome.runtime.sendMessage({ type: "getAuthStatus" }, (res) => {
  if (res?.loggedIn) showLoggedIn();
  else showLoggedOut();
});

loginBtn.addEventListener("click", () => {
  setStatus("Opening login…", "loading");
  loginBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "login" }, (res) => {
    loginBtn.disabled = false;
    if (res?.error) {
      setStatus(res.error, "err");
    } else {
      showLoggedIn();
    }
  });
});

logoutBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "logout" }, () => {
    showLoggedOut();
  });
});

// --- Update UI ---

function showUpdateBanner(update) {
  if (!update?.available) {
    updateBanner.classList.add("hidden");
    return;
  }
  updateVersion.textContent = `v${manifest.version} → v${update.version}`;
  updateBanner.classList.remove("hidden");
}

// Load cached update state on popup open
chrome.runtime.sendMessage({ type: "getCachedUpdate" }, (res) => {
  showUpdateBanner(res);
});

// Update button opens the update page
updateApplyBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("update.html") });
  window.close();
});

// Manual check button
checkUpdateBtn.addEventListener("click", () => {
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = "Checking…";

  chrome.runtime.sendMessage({ type: "checkUpdate" }, (res) => {
    checkUpdateBtn.disabled = false;

    if (res?.available) {
      checkUpdateBtn.textContent = "Update found!";
      showUpdateBanner(res);
    } else if (res?.error) {
      checkUpdateBtn.textContent = "Check failed";
      setTimeout(() => { checkUpdateBtn.textContent = "Check for updates"; }, 2000);
    } else {
      checkUpdateBtn.textContent = "Up to date";
      setTimeout(() => { checkUpdateBtn.textContent = "Check for updates"; }, 2000);
    }
  });
});
