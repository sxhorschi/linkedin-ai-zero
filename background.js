const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "user:inference user:profile";

// --- PKCE helpers ---

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

async function generatePKCE() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}

// --- OAuth flow via chrome.tabs ---

let pendingLogin = null;

async function startLogin() {
  const { verifier, challenge } = await generatePKCE();
  await chrome.storage.local.set({ _pkce_verifier: verifier });

  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    // Store the pending login so the tab listener can resolve it
    pendingLogin = { resolve, reject };

    chrome.tabs.create({ url: authUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        pendingLogin = null;
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        pendingLogin.tabId = tab.id;
      }
    });
  });
}

// Watch for the OAuth callback redirect
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!pendingLogin || tabId !== pendingLogin.tabId) return;
  if (!changeInfo.url) return;

  const url = changeInfo.url;
  if (!url.startsWith(REDIRECT_URI)) return;

  // Got the callback — extract code and close tab
  chrome.tabs.remove(tabId);

  const parsed = new URL(url);
  let code = parsed.searchParams.get("code");

  if (!code) {
    // Check hash fragment: code#state format
    const hash = parsed.hash.substring(1);
    if (hash && !hash.includes("=")) {
      code = hash.split("#")[0];
    } else {
      const hashParams = new URLSearchParams(hash);
      code = hashParams.get("code");
    }
  }

  if (!code) {
    pendingLogin.reject(new Error("No authorization code received"));
    pendingLogin = null;
    return;
  }

  // Strip #state suffix if present
  if (code.includes("#")) code = code.split("#")[0];

  const login = pendingLogin;
  pendingLogin = null;

  (async () => {
    try {
      const { _pkce_verifier: verifier } = await chrome.storage.local.get("_pkce_verifier");
      if (!verifier) throw new Error("PKCE verifier not found");
      const result = await exchangeCode(code, verifier);
      login.resolve(result);
    } catch (err) {
      login.reject(err);
    }
  })();
});

// If user closes the auth tab manually, reject the login
chrome.tabs.onRemoved.addListener((tabId) => {
  if (pendingLogin && pendingLogin.tabId === tabId) {
    pendingLogin.reject(new Error("Login cancelled"));
    pendingLogin = null;
  }
});

// --- Token exchange ---

async function exchangeCode(code, verifier) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const tokens = await response.json();
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  await chrome.storage.local.set({
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token,
    oauth_expires_at: expiresAt,
  });

  await chrome.storage.local.remove("_pkce_verifier");
  scheduleRefresh(tokens.expires_in || 3600);

  return { success: true };
}

// --- Token refresh ---

async function refreshToken() {
  const { oauth_refresh_token: refreshTok } =
    await chrome.storage.local.get("oauth_refresh_token");
  if (!refreshTok) throw new Error("No refresh token");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshTok,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    await chrome.storage.local.remove([
      "oauth_access_token",
      "oauth_refresh_token",
      "oauth_expires_at",
    ]);
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokens = await response.json();
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  await chrome.storage.local.set({
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token || refreshTok,
    oauth_expires_at: expiresAt,
  });

  scheduleRefresh(tokens.expires_in || 3600);
}

function scheduleRefresh(expiresInSeconds) {
  const delayMin = Math.max((expiresInSeconds - 300) / 60, 1);
  chrome.alarms.create("oauth_refresh", { delayInMinutes: delayMin });
}

// --- Get valid access token ---

async function getAccessToken() {
  const stored = await chrome.storage.local.get([
    "oauth_access_token",
    "oauth_expires_at",
    "oauth_refresh_token",
  ]);

  if (!stored.oauth_access_token) return null;

  if (stored.oauth_expires_at && Date.now() > stored.oauth_expires_at - 120000) {
    try {
      await refreshToken();
      const updated = await chrome.storage.local.get("oauth_access_token");
      return updated.oauth_access_token;
    } catch {
      return null;
    }
  }

  return stored.oauth_access_token;
}

async function logout() {
  await chrome.storage.local.remove([
    "oauth_access_token",
    "oauth_refresh_token",
    "oauth_expires_at",
    "_pkce_verifier",
  ]);
  chrome.alarms.clear("oauth_refresh");
}

// --- Update checker (fetches manifest.json from GitHub main branch) ---

const REPO_OWNER = "sxhorschi";
const REPO_NAME = "linkedin-ai-zero";
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/manifest.json`;
const UPDATE_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "styles.css",
  "popup.html",
  "popup.js",
];

async function checkForUpdate() {
  try {
    const res = await fetch(REMOTE_MANIFEST, { cache: "no-store" });
    if (!res.ok) return { available: false };

    const remote = await res.json();
    const remoteVersion = remote.version;
    const localVersion = chrome.runtime.getManifest().version;

    if (compareVersions(remoteVersion, localVersion) > 0) {
      const result = {
        available: true,
        version: remoteVersion,
        current: localVersion,
      };
      await chrome.storage.local.set({ _update: result });
      return result;
    }

    await chrome.storage.local.remove("_update");
    return { available: false, current: localVersion };
  } catch (err) {
    console.error("[AI Detector] Update check failed:", err);
    return { available: false, error: err.message };
  }
}

async function applyUpdate() {
  // Download all files from GitHub main branch
  const baseUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/`;
  const files = {};

  for (const file of UPDATE_FILES) {
    const res = await fetch(baseUrl + file, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to download ${file}: ${res.status}`);
    files[file] = await res.text();
  }

  // Store the new files — the popup/content script will read these
  await chrome.storage.local.set({
    _update_files: files,
    _update_ready: true,
    _update_version: files["manifest.json"]
      ? JSON.parse(files["manifest.json"]).version
      : "unknown",
  });

  return { success: true, version: JSON.parse(files["manifest.json"]).version };
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// --- Listeners ---

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "oauth_refresh") {
    refreshToken().catch((err) =>
      console.error("[AI Detector] Token refresh failed:", err)
    );
  }
});

// Check for updates on browser startup + schedule token refresh
chrome.runtime.onStartup.addListener(async () => {
  checkForUpdate();

  const { oauth_expires_at } = await chrome.storage.local.get("oauth_expires_at");
  if (oauth_expires_at) {
    const remaining = Math.max((oauth_expires_at - Date.now()) / 1000 - 300, 60);
    scheduleRefresh(remaining);
  }
});

// Also check on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  checkForUpdate();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "login") {
    startLogin()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === "logout") {
    logout()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === "getToken") {
    getAccessToken()
      .then((token) => sendResponse({ token }))
      .catch(() => sendResponse({ token: null }));
    return true;
  }

  if (msg.type === "getAuthStatus") {
    getAccessToken()
      .then((token) => sendResponse({ loggedIn: !!token }))
      .catch(() => sendResponse({ loggedIn: false }));
    return true;
  }

  if (msg.type === "checkUpdate") {
    checkForUpdate()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ available: false, error: err.message }));
    return true;
  }

  if (msg.type === "getCachedUpdate") {
    chrome.storage.local.get("_update", ({ _update }) => {
      sendResponse(_update || { available: false });
    });
    return true;
  }

  if (msg.type === "applyUpdate") {
    applyUpdate()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});
