const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTH_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "user:inference user:profile";

// --- PKCE helpers ---

function generateRandomBytes(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

async function generatePKCE() {
  const verifier = base64UrlEncode(generateRandomBytes(32));
  const challengeBuffer = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBuffer);
  return { verifier, challenge };
}

// --- OAuth flow ---

async function startLogin() {
  const { verifier, challenge } = await generatePKCE();

  // Store verifier for token exchange
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

  // Use chrome.identity to launch the auth flow
  // It will intercept the redirect back to console.anthropic.com
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        try {
          const result = await handleCallback(redirectUrl);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

async function handleCallback(redirectUrl) {
  const url = new URL(redirectUrl);
  // Anthropic returns code in the URL — may be in hash or query
  let code = url.searchParams.get("code");
  if (!code) {
    // Sometimes returned as fragment: code#state
    const hash = url.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    code = hashParams.get("code");
  }
  if (!code) {
    throw new Error("No authorization code received");
  }

  // Code might contain #state suffix
  if (code.includes("#")) {
    code = code.split("#")[0];
  }

  const { _pkce_verifier: verifier } = await chrome.storage.local.get("_pkce_verifier");
  if (!verifier) throw new Error("PKCE verifier not found");

  return exchangeCode(code, verifier);
}

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

  // Clean up PKCE verifier
  await chrome.storage.local.remove("_pkce_verifier");

  // Schedule refresh
  scheduleRefresh(tokens.expires_in || 3600);

  return { success: true };
}

async function refreshToken() {
  const { oauth_refresh_token: refreshTok } = await chrome.storage.local.get("oauth_refresh_token");
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
    const text = await response.text();
    // If refresh fails, clear tokens so user re-logs
    await chrome.storage.local.remove([
      "oauth_access_token",
      "oauth_refresh_token",
      "oauth_expires_at",
    ]);
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
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
  // Refresh 5 minutes before expiry
  const delayMs = Math.max((expiresInSeconds - 300) * 1000, 60000);
  chrome.alarms.create("oauth_refresh", { delayInMinutes: delayMs / 60000 });
}

// --- Get valid access token (auto-refresh if needed) ---

async function getAccessToken() {
  const stored = await chrome.storage.local.get([
    "oauth_access_token",
    "oauth_expires_at",
    "oauth_refresh_token",
  ]);

  if (!stored.oauth_access_token) return null;

  // If token expires within 2 minutes, refresh
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

// --- Alarm listener for token refresh ---

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "oauth_refresh") {
    refreshToken().catch((err) =>
      console.error("[AI Detector] Token refresh failed:", err)
    );
  }
});

// --- On startup, schedule refresh if we have tokens ---

chrome.runtime.onStartup.addListener(async () => {
  const { oauth_expires_at } = await chrome.storage.local.get("oauth_expires_at");
  if (oauth_expires_at) {
    const remaining = Math.max((oauth_expires_at - Date.now()) / 1000 - 300, 60);
    scheduleRefresh(remaining);
  }
});

// --- Message handler for popup + content script ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "login") {
    startLogin()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async
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
});
