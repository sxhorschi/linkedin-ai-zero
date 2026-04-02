const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const loggedOutEl = document.getElementById("logged-out");
const loggedInEl = document.getElementById("logged-in");
const statusEl = document.getElementById("status");

function showLoggedIn() {
  loggedOutEl.classList.add("hidden");
  loggedInEl.classList.remove("hidden");
  statusEl.textContent = "Connected ✓";
  statusEl.className = "status status--ok";
}

function showLoggedOut() {
  loggedInEl.classList.add("hidden");
  loggedOutEl.classList.remove("hidden");
  statusEl.textContent = "";
  statusEl.className = "status";
}

// Check current auth status
chrome.runtime.sendMessage({ type: "getAuthStatus" }, (res) => {
  if (res?.loggedIn) showLoggedIn();
  else showLoggedOut();
});

loginBtn.addEventListener("click", () => {
  statusEl.textContent = "Signing in…";
  statusEl.className = "status";
  loginBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "login" }, (res) => {
    loginBtn.disabled = false;
    if (res?.error) {
      statusEl.textContent = res.error;
      statusEl.className = "status status--err";
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
