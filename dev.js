#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 35729;
const WATCH_DIR = __dirname;
const WATCH_EXT = [".js", ".css", ".html", ".json"];
const IGNORE = ["dev.js", "node_modules", ".git"];

let lastChange = Date.now();

// Watch for file changes
fs.watch(WATCH_DIR, { recursive: true }, (event, filename) => {
  if (!filename) return;
  if (IGNORE.some((i) => filename.startsWith(i))) return;
  if (!WATCH_EXT.includes(path.extname(filename))) return;

  lastChange = Date.now();
  console.log(`\x1b[36m[reload]\x1b[0m ${filename} changed`);
});

// Tiny HTTP server — background script polls this
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ changed: lastChange }));
});

server.listen(PORT, () => {
  console.log(`\x1b[32m[dev]\x1b[0m Watching for changes on http://localhost:${PORT}`);
  console.log(`\x1b[32m[dev]\x1b[0m Extension will auto-reload on save`);
});
