const downloadBtn = document.getElementById("download-btn");
const reloadBtn = document.getElementById("reload-btn");
const statusEl = document.getElementById("status");
const versionInfo = document.getElementById("version-info");
const step1Num = document.getElementById("step1-num");

const localVersion = chrome.runtime.getManifest().version;

// Show version info from cached update
chrome.runtime.sendMessage({ type: "getCachedUpdate" }, (res) => {
  if (res?.available) {
    versionInfo.textContent = `v${localVersion} → v${res.version}`;
  } else {
    versionInfo.textContent = `Current: v${localVersion}`;
  }
});

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = `status status--${type}`;
  statusEl.classList.remove("hidden");
}

// Download ZIP with updated files
downloadBtn.addEventListener("click", () => {
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Downloading…";
  setStatus("Fetching latest files from GitHub…", "info");

  chrome.runtime.sendMessage({ type: "applyUpdate" }, async (res) => {
    if (res?.error) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download ZIP";
      setStatus(`Error: ${res.error}`, "err");
      return;
    }

    setStatus("Building ZIP…", "info");

    // Get downloaded files from storage
    const { _update_files: files } = await chrome.storage.local.get("_update_files");
    if (!files) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download ZIP";
      setStatus("No update files found. Try checking for updates first.", "err");
      return;
    }

    // Build ZIP using minimal ZIP creator (no library needed)
    try {
      const zip = buildZip(files);
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkedin-ai-detector-v${res.version}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      step1Num.textContent = "✓";
      step1Num.classList.add("step__num--done");
      downloadBtn.textContent = "Downloaded!";
      setStatus(
        `ZIP downloaded! Extract it into your extension folder, replacing existing files. Then click "Reload Extension".`,
        "ok"
      );
    } catch (err) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download ZIP";
      setStatus(`ZIP creation failed: ${err.message}`, "err");
    }
  });
});

reloadBtn.addEventListener("click", () => {
  chrome.runtime.reload();
});

// --- Minimal ZIP builder (no external library) ---

function buildZip(files) {
  const entries = Object.entries(files);
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // compression (store)
    lv.setUint16(10, 0, true);          // mod time
    lv.setUint16(12, 0, true);          // mod date
    lv.setUint32(14, crc, true);        // crc32
    lv.setUint32(18, dataBytes.length, true); // compressed size
    lv.setUint32(22, dataBytes.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // filename length
    lv.setUint16(28, 0, true);          // extra field length
    localHeader.set(nameBytes, 30);

    // Central directory entry
    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);  // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // compression
    cv.setUint16(12, 0, true);           // mod time
    cv.setUint16(14, 0, true);           // mod date
    cv.setUint32(16, crc, true);         // crc32
    cv.setUint32(20, dataBytes.length, true); // compressed size
    cv.setUint32(24, dataBytes.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // filename length
    cv.setUint16(30, 0, true);           // extra field length
    cv.setUint16(32, 0, true);           // comment length
    cv.setUint16(34, 0, true);           // disk number start
    cv.setUint16(36, 0, true);           // internal attrs
    cv.setUint32(38, 0, true);           // external attrs
    cv.setUint32(42, offset, true);      // local header offset
    centralEntry.set(nameBytes, 46);

    parts.push(localHeader, dataBytes);
    directory.push(centralEntry);
    offset += localHeader.length + dataBytes.length;
  }

  // End of central directory
  const dirOffset = offset;
  let dirSize = 0;
  for (const d of directory) dirSize += d.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);       // signature
  ev.setUint16(4, 0, true);                 // disk number
  ev.setUint16(6, 0, true);                 // central dir disk
  ev.setUint16(8, entries.length, true);     // entries on disk
  ev.setUint16(10, entries.length, true);    // total entries
  ev.setUint32(12, dirSize, true);           // central dir size
  ev.setUint32(16, dirOffset, true);         // central dir offset
  ev.setUint16(20, 0, true);                // comment length

  const all = [...parts, ...directory, eocd];
  const totalSize = all.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const a of all) {
    result.set(a, pos);
    pos += a.length;
  }
  return result;
}

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
