const loginBtn = document.getElementById("login");
const logoutBtn = document.getElementById("logout");
const loggedOutEl = document.getElementById("logged-out");
const loggedInEl = document.getElementById("logged-in");
const statusEl = document.getElementById("status");

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

// Check current auth status
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
