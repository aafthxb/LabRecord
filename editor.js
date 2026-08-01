// editor.js

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

// Same key script.js uses on the home page — sessionStorage (not
// localStorage) so it survives navigating here but is gone the moment
// the tab closes, never written to disk.
const EDITOR_SESSION_KEY = "lr_editor_session_code";

const State = {
  languages: null,      // generated/language-index.json content (array)
  languageIndex: [],    // generated/language-index.json content
  searchIndex: {},      // generated/search-index.json content (for duplicate checks + Manage Files)
  selectedFolder: null, // e.g. "C"
  selectedLangEntry: null, // matching entry from State.languages
  filename: "",
  images: [],           // [{ file, url, id }]
  imageTexts: [],        // raw OCR text per image, same order as State.images
  mergeNotes: [],
  accessCode: "",        // kept in memory only, never persisted — asked for on every visit
  skippedStep1: false,   // true when the folder arrived preset via ?folder=, so step 1 (language) was never shown
  batchMode: false,      // true while Step 3 is showing the multi-file review list instead of the single-file one
  batchFiles: [],        // [{ id, filename, code, error }] — the "upload multiple files at once" path
};

let tesseractLoadPromise = null;

// ---------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------

function $(id) {
  return document.getElementById(id);
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// Shows a section with the same fade/slide-up entrance the homepage
// uses when opening a language folder (.view-enter, defined in
// style.css) — restarts the animation even if it's already visible.
function revealSection(elToShow) {
  elToShow.style.display = "block";
  elToShow.classList.remove("view-enter");
  void elToShow.offsetWidth; // force reflow so the animation restarts
  elToShow.classList.add("view-enter");
  elToShow.addEventListener(
    "animationend",
    () => elToShow.classList.remove("view-enter"),
    { once: true }
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Fades a .modal-overlay in/out (see the is-visible transition in
// editor.css) instead of an instant display:none/flex snap. Toggling
// `display` directly can't be transitioned, so we flip it first, force
// a reflow, then add the class that actually animates opacity/transform.
function showOverlay(overlayEl) {
  overlayEl.style.display = "flex";
  void overlayEl.offsetWidth; // reflow so the transition below actually runs
  overlayEl.classList.add("is-visible");
}

function hideOverlay(overlayEl) {
  overlayEl.classList.remove("is-visible");
  const finish = () => { overlayEl.style.display = "none"; };
  overlayEl.addEventListener("transitionend", finish, { once: true });
  // Fallback in case transitionend never fires (e.g. reduced motion).
  setTimeout(finish, 250);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

// ---------------------------------------------------------------
// Access gate
// ---------------------------------------------------------------

async function initGate() {
  $("gate-submit").addEventListener("click", submitGate);
  $("gate-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGate();
  });

  // If the code was already verified this tab session (e.g. unlocked
  // from the "+" button on the home page), skip straight past the gate.
  const sessionCode = sessionStorage.getItem(EDITOR_SESSION_KEY);
  if (sessionCode) {
    const ok = await verifyCode(sessionCode);
    if (ok) {
      State.accessCode = sessionCode;
      await enterWizard();
      return;
    }
    sessionStorage.removeItem(EDITOR_SESSION_KEY);
  }

  showGate();
}

function showGate() {
  showOverlay($("gate-overlay"));
  $("gate-input").focus();
}

async function submitGate() {
  const code = $("gate-input").value.trim();
  if (!code) return;

  $("gate-submit").disabled = true;
  $("gate-submit").textContent = "CHECKING…";

  const ok = await verifyCode(code);

  $("gate-submit").disabled = false;
  $("gate-submit").textContent = "UNLOCK";

  if (ok) {
    State.accessCode = code;
    sessionStorage.setItem(EDITOR_SESSION_KEY, code);
    hideOverlay($("gate-overlay"));
    await enterWizard();
  } else {
    $("gate-error").textContent = "Incorrect access code.";
    $("gate-error").style.display = "block";
  }
}

async function verifyCode(code) {
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode: code }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

function getAccessCode() {
  return State.accessCode || "";
}

// ---------------------------------------------------------------
// Wizard bootstrap
// ---------------------------------------------------------------

let siteDataLoadPromise = null;

// Loads language-index.json / search-index.json exactly once per visit
// and caches the in-flight promise, so both "Add Program" and "Manage
// Files" can call this freely without refetching or racing.
//
// language-index.json is generated straight from scripts/languages.json
// at build time (see scripts/generate-index.js) and now carries every
// field the editor needs, including aliases/extensions — so there's no
// separate client-side fetch of the raw config file. That file lives in
// scripts/ as build-time input, not something meant to be served to the
// browser, and guessing at its public URL was the source of the old
// "languages.json not loading" issue.
function ensureSiteDataLoaded() {
  if (siteDataLoadPromise) return siteDataLoadPromise;

  siteDataLoadPromise = Promise.all([
    fetchJson("/generated/language-index.json"),
    fetchJson("/generated/search-index.json").catch(() => ({})),
  ]).then(([languageIndex, searchIndex]) => {
    State.languages = languageIndex;
    State.languageIndex = languageIndex;
    State.searchIndex = searchIndex;
  });

  return siteDataLoadPromise;
}

// ---------------------------------------------------------------
// Wizard entry
// ---------------------------------------------------------------

// Arriving here always means "add a program" — deleting/reordering
// existing ones now happens inline on the home page. If we got here
// via the site's "+" button (editor.html?folder=C), the language is
// already known, so step 1 is skipped entirely.
async function enterWizard() {
  revealSection($("wizard"));
  preloadTesseract();

  try {
    await ensureSiteDataLoaded();
  } catch (err) {
    showWizardError("Failed to load site data: " + err.message);
    return;
  }

  buildLangGrid();

  const params = new URLSearchParams(window.location.search);
  const folderParam = params.get("folder");
  const presetLang = folderParam
    ? State.languageIndex.find((l) => l.folder === folderParam)
    : null;

  if (presetLang) {
    State.skippedStep1 = true;
    presetLanguage(presetLang);
  } else {
    State.skippedStep1 = false;
    goToStep(1);
  }
}

function presetLanguage(lang) {
  const normalized = lang.folder.toLowerCase();
  const langEntry = Object.values(State.languages).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalized)
  );

  State.selectedFolder = lang.folder;
  State.selectedLangEntry = langEntry;
  $("step2-folder-label").textContent = lang.displayName;
  updateBatchFileInputHints();

  document.querySelectorAll(".lang-card").forEach((c) => {
    c.classList.toggle("selected", c.textContent.trim() === lang.displayName.toUpperCase());
  });

  goToStep(2);
}

// Returns to the home page — back into the folder just being worked
// on, if one is selected, so the person lands right where they left.
function goHome() {
  const folder = State.selectedFolder;
  window.location.href = folder
    ? `index.html?folder=${encodeURIComponent(folder)}`
    : "index.html";
}

function showWizardError(message) {
  const box = $("wizard-error");
  box.textContent = message;
  box.style.display = "block";
}

function clearWizardError() {
  $("wizard-error").style.display = "none";
}

function preloadTesseract() {
  if (tesseractLoadPromise) return tesseractLoadPromise;

  tesseractLoadPromise = new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Could not load OCR engine"));
    document.head.appendChild(script);
  });

  return tesseractLoadPromise;
}

async function ensureTesseractReady() {
  if (window.Tesseract) return;

  showOverlay($("loading-overlay"));
  $("loading-text").textContent = "Loading OCR engine, please wait…";

  try {
    await preloadTesseract();
  } finally {
    hideOverlay($("loading-overlay"));
  }
}

// ---------------------------------------------------------------
// Wizard topbar ("« HOME" buttons)
// ---------------------------------------------------------------

function initWizardTopbar() {
  $("wizard-menu-btn").addEventListener("click", goHome);
  $("step1-back").addEventListener("click", goHome);
}

// ---------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------

function goToStep(n) {
  document.querySelectorAll(".step-panel").forEach((p) => p.classList.remove("active"));
  const panel = $(`step-${n}`);
  panel.classList.add("active");
  panel.classList.remove("view-enter");
  void panel.offsetWidth; // force reflow so the animation restarts
  panel.classList.add("view-enter");
  panel.addEventListener(
    "animationend",
    () => panel.classList.remove("view-enter"),
    { once: true }
  );

  document.querySelectorAll(".step-dot").forEach((dot) => {
    const step = Number(dot.dataset.step);
    dot.classList.toggle("active", step === n);
    dot.classList.toggle("done", step < n);
  });
}

// ---------------------------------------------------------------
// Step 1: language grid
// ---------------------------------------------------------------

function buildLangGrid() {
  const grid = $("lang-grid");
  grid.innerHTML = "";

  State.languageIndex.forEach((lang) => {
    // Reuses .action-btn so this card looks and behaves exactly like
    // every other button on the site (same idle/hover/focus styling,
    // defined once in style.css) — .lang-card only adds grid sizing
    // and the small "selected" checkmark.
    const card = el("button", "lang-card action-btn", lang.displayName.toUpperCase());
    card.type = "button";
    card.addEventListener("click", (e) => selectLanguage(lang, e));
    grid.appendChild(card);
  });
}

function selectLanguage(lang, e) {
  document.querySelectorAll(".lang-card").forEach((c) => c.classList.remove("selected"));
  e.currentTarget.classList.add("selected");

  const normalized = lang.folder.toLowerCase();
  const langEntry = Object.values(State.languages).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalized)
  );

  State.selectedFolder = lang.folder;
  State.selectedLangEntry = langEntry;

  $("step2-folder-label").textContent = lang.displayName;
  updateBatchFileInputHints();

  setTimeout(() => goToStep(2), 150);
}

// ---------------------------------------------------------------
// Step 2: filename + images
// ---------------------------------------------------------------

function initStep2() {
  $("filename-input").addEventListener("input", validateFilename);
  $("image-input").addEventListener("change", handleImagesSelected);
  $("image-input-trigger").addEventListener("click", () => $("image-input").click());
  $("step2-back").addEventListener("click", () => {
    // Normal path: reached via the site's "+" button with a folder
    // already preset, so step 1 was never shown — Back should leave
    // the wizard and return to that folder, not to a hidden step.
    if (State.skippedStep1) {
      goHome();
    } else {
      goToStep(1);
    }
  });
  $("step2-next").addEventListener("click", runExtraction);
  $("step2-paste-instead").addEventListener("click", goToManualEntry);

  initImagePaste();
  initBatchUpload();
  updateImageInputStatus();
}

function existingFilesInFolder() {
  const list = State.searchIndex[State.selectedFolder] || [];
  return list.map((p) => p.file.toLowerCase());
}

function validateFilename() {
  const statusEl = $("filename-status");
  let raw = $("filename-input").value.trim();

  State.filename = "";
  statusEl.style.display = "none";
  statusEl.className = "banner";

  if (!raw) {
    updateNextEnabled();
    return;
  }

  if (/[\/\\]/.test(raw) || raw.includes("..")) {
    statusEl.textContent = "Filename can't contain slashes or \"..\".";
    statusEl.classList.add("banner-error");
    statusEl.style.display = "block";
    updateNextEnabled();
    return;
  }

  const entry = State.selectedLangEntry;
  const hasExt = entry.extensions.some((ext) => raw.toLowerCase().endsWith(ext));

  if (!hasExt) {
    raw = raw + entry.extensions[0];
  }

  const dup = existingFilesInFolder().includes(raw.toLowerCase());

  if (dup) {
    statusEl.textContent = `"${raw}" already exists in ${State.selectedFolder}/. Choose a different name.`;
    statusEl.classList.add("banner-error");
    statusEl.style.display = "block";
    updateNextEnabled();
    return;
  }

  State.filename = raw;
  statusEl.textContent = `Will be saved as: ${raw}`;
  statusEl.classList.add("banner-success");
  statusEl.style.display = "block";

  updateNextEnabled();
}

// Shared entry point for both the file <input> and pasted images, so
// both paths behave identically and stay in sync.
function addImageFiles(files) {
  if (!files || !files.length) return;

  files.forEach((file) => {
    State.images.push({
      id: uid(),
      file,
      url: URL.createObjectURL(file),
    });
  });

  renderImageList();
  updateImageInputStatus();
  $("image-required-warning").style.display = "none";
}

function handleImagesSelected(e) {
  const files = Array.from(e.target.files || []);

  // Reset the native input right away so the same file can be re-added
  // later if removed. We never rely on the browser's own "N files
  // selected" label — updateImageInputStatus() is our own indicator.
  e.target.value = "";

  addImageFiles(files);
}

// Lets users paste a screenshot (Ctrl+V / Cmd+V) straight from the
// clipboard while they're on step 2, instead of only being able to
// pick files from disk.
function initImagePaste() {
  document.addEventListener("paste", (e) => {
    if (!$("step-2").classList.contains("active")) return;

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    const files = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const raw = item.getAsFile();
        if (!raw) continue;

        // Clipboard images usually come in as "image.png" with no
        // useful name — give each a distinct, ordered name instead.
        const ext = (raw.type.split("/")[1] || "png").replace("+xml", "");
        const named = new File(
          [raw],
          `pasted-${Date.now()}-${State.images.length + files.length + 1}.${ext}`,
          { type: raw.type }
        );
        files.push(named);
      }
    }

    if (files.length) {
      e.preventDefault();
      addImageFiles(files);
    }
  });
}

function updateImageInputStatus() {
  const status = $("image-input-status");
  const n = State.images.length;

  status.textContent = n === 0
    ? "No files chosen — or paste (Ctrl+V) a screenshot"
    : `${n} photo${n === 1 ? "" : "s"} added — add more, or paste (Ctrl+V) another`;
}

function renderImageList() {
  const list = $("image-list");
  list.innerHTML = "";

  State.images.forEach((img, index) => {
    const item = el("div", "image-item");

    const thumb = el("img");
    thumb.src = img.url;
    thumb.alt = "";

    const name = el("div", "image-name", `${index + 1}. ${img.file.name}`);

    const actions = el("div", "image-actions");

    const upBtn = el("button", "", "↑");
    upBtn.type = "button";
    upBtn.disabled = index === 0;
    upBtn.onclick = () => moveImage(index, -1);

    const downBtn = el("button", "", "↓");
    downBtn.type = "button";
    downBtn.disabled = index === State.images.length - 1;
    downBtn.onclick = () => moveImage(index, 1);

    const removeBtn = el("button", "", "✕");
    removeBtn.type = "button";
    removeBtn.onclick = () => removeImage(index);

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(removeBtn);

    item.appendChild(thumb);
    item.appendChild(name);
    item.appendChild(actions);

    list.appendChild(item);
  });
}

function moveImage(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= State.images.length) return;
  const [item] = State.images.splice(index, 1);
  State.images.splice(newIndex, 0, item);
  renderImageList();
}

function removeImage(index) {
  State.images.splice(index, 1);
  renderImageList();
  updateImageInputStatus();
  updateNextEnabled();
}

function updateNextEnabled() {
  // EXTRACT CODE / PASTE CODE are always clickable now — disabling them
  // silently (with no visual "disabled" styling anywhere on the site)
  // just looked broken. Validation happens in the click handlers
  // instead, where we can show an actual warning message.
}

// Shared guard for both "EXTRACT CODE" and "PASTE CODE" — call at the
// top of each handler. Shows a clear warning next to the filename
// field and focuses it, instead of the button just doing nothing.
function requireFilename() {
  if (State.filename) return true;

  const statusEl = $("filename-status");
  statusEl.textContent = "Enter a file name first — that's what this will be saved as.";
  statusEl.className = "banner banner-error";
  statusEl.style.display = "block";

  const input = $("filename-input");
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}

// Switches Step 3 back to the single-file review UI (code-textarea,
// preview box, helper) and away from the batch list — shared by the
// screenshot and paste-code paths, both of which produce exactly one
// file.
function showSingleReview() {
  State.batchMode = false;
  $("batch-review").style.display = "none";
  $("single-review").style.display = "block";
  $("step3-save").textContent = "SAVE TO GITHUB";
}

// Skips OCR entirely — jumps straight to Step 3 with a blank textarea
// for the user to paste or type code into by hand.
function goToManualEntry() {
  if (!requireFilename()) return;

  clearWizardError();
  State.imageTexts = [];
  State.mergeNotes = [];

  showSingleReview();
  $("code-textarea").value = "";
  renderMergeNotes([]);
  updateReviewPreview();
  goToStep(3);
}

// ---------------------------------------------------------------
// OCR + merge
// ---------------------------------------------------------------

async function runExtraction() {
  $("image-required-warning").style.display = "none";

  if (!requireFilename()) return;

  if (!State.images.length) {
    const warn = $("image-required-warning");
    warn.textContent = "Add at least one photo before extracting.";
    warn.style.display = "block";
    return;
  }

  clearWizardError();
  await ensureTesseractReady();

  showOverlay($("loading-overlay"));
  State.imageTexts = [];

  try {
    for (let i = 0; i < State.images.length; i++) {
      $("loading-text").textContent =
        `Reading image ${i + 1} of ${State.images.length}…`;

      const result = await window.Tesseract.recognize(State.images[i].file, "eng");
      State.imageTexts.push(result.data.text || "");
    }

    $("loading-text").textContent = "Merging pages…";
    const { mergedCode, notes } = mergeImageTexts(State.imageTexts);
    State.mergeNotes = notes;

    showSingleReview();
    $("code-textarea").value = mergedCode;
    renderMergeNotes(notes);
    updateReviewPreview();
    goToStep(3);
  } catch (err) {
    showWizardError("OCR failed: " + err.message);
  } finally {
    hideOverlay($("loading-overlay"));
  }
}

function renderMergeNotes(notes) {
  const box = $("merge-notes");
  box.innerHTML = "";

  if (notes.length === 0) return;

  notes.forEach((note) => {
    const banner = el("div", `banner ${note.type === "warn" ? "banner-warn" : "banner-success"}`, note.text);
    box.appendChild(banner);
  });
}

// --- fuzzy line-overlap merge across multiple OCR'd pages ---

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function lineSimilarity(a, b) {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

function findOverlap(prevLines, nextLines) {
  const maxWindow = Math.min(10, prevLines.length, nextLines.length);
  let bestWindow = 0;
  let bestScore = 0;

  for (let w = maxWindow; w >= 1; w--) {
    const tail = prevLines.slice(-w);
    const head = nextLines.slice(0, w);

    let total = 0;
    for (let i = 0; i < w; i++) total += lineSimilarity(tail[i], head[i]);
    const avg = total / w;

    if (avg >= 0.8 && avg > bestScore) {
      bestScore = avg;
      bestWindow = w;
    }
  }

  return bestWindow;
}

function mergeImageTexts(texts) {
  const notes = [];

  const pages = texts.map((t) =>
    t.split(/\r?\n/).filter((l, i, arr) => {
      // trim leading/trailing blank lines per page, keep interior ones
      return true;
    })
  ).map((lines) => {
    // strip leading/trailing empty lines
    let start = 0, end = lines.length;
    while (start < end && !lines[start].trim()) start++;
    while (end > start && !lines[end - 1].trim()) end--;
    return lines.slice(start, end);
  });

  if (pages.length === 0) return { mergedCode: "", notes };

  let merged = [...pages[0]];

  for (let i = 1; i < pages.length; i++) {
    const overlap = findOverlap(merged, pages[i]);

    if (overlap > 0) {
      merged = merged.concat(pages[i].slice(overlap));
      notes.push({
        type: "success",
        text: `Image ${i} → ${i + 1}: detected ${overlap} overlapping line(s), merged automatically.`,
      });
    } else {
      merged.push("");
      merged = merged.concat(pages[i]);
      notes.push({
        type: "warn",
        text: `Image ${i} → ${i + 1}: no confident overlap found — pages joined as-is. Please check the seam.`,
      });
    }
  }

  return { mergedCode: merged.join("\n"), notes };
}

// ---------------------------------------------------------------
// Step 2: batch upload (multiple finished code files at once)
// ---------------------------------------------------------------

function initBatchUpload() {
  $("batch-file-input").addEventListener("change", handleBatchFilesSelected);
  $("batch-input-trigger").addEventListener("click", () => $("batch-file-input").click());
  $("step2-batch-next").addEventListener("click", goToBatchReview);
}

// Sets the hidden <input>'s accept attribute and the hint text next to
// it to whatever extensions the currently-selected language allows.
function updateBatchFileInputHints() {
  const entry = State.selectedLangEntry;
  if (!entry) return;
  // Extensions alone (e.g. ".java") aren't enough on some mobile file
  // pickers — Android/iOS map accept filters to MIME types, and custom
  // source-code extensions often aren't in that map, so matching files
  // get greyed out or hidden entirely. Adding the "text/*" MIME as a
  // fallback fixes that without loosening desktop filtering (extension
  // + server-side validation still apply).
  $("batch-file-input").accept = entry.extensions.join(",") + ",text/*";
  $("step2-batch-exts").textContent = entry.extensions.join(", ");
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

function handleBatchFilesSelected(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;

  Promise.all(
    files.map((file) =>
      readFileAsText(file)
        .then((code) => ({ id: uid(), filename: file.name, code, error: null }))
        .catch((err) => ({ id: uid(), filename: file.name, code: "", error: err.message }))
    )
  ).then((entries) => {
    State.batchFiles.push(...entries);
    updateBatchInputStatus();
    $("batch-required-warning").style.display = "none";
  });
}

function updateBatchInputStatus() {
  const status = $("batch-input-status");
  const n = State.batchFiles.length;
  status.textContent = n === 0
    ? "No files chosen"
    : `${n} file${n === 1 ? "" : "s"} added — add more if needed`;
}

// Jumps to Step 3 in batch mode. Unlike the single-file paths, this
// doesn't need requireFilename() — each file keeps its own name,
// edited inline in the review list.
function goToBatchReview() {
  if (!State.batchFiles.length) {
    const warn = $("batch-required-warning");
    warn.textContent = "Choose at least one file first.";
    warn.style.display = "block";
    return;
  }

  clearWizardError();
  State.batchMode = true;

  $("single-review").style.display = "none";
  $("batch-review").style.display = "block";

  renderBatchList();
  goToStep(3);
}

// Checks one filename against the folder's existing files and every
// other filename currently in the batch. Returns an error string, or
// null if it's fine.
function validateBatchFilename(rawName, existingLower, seenCounts) {
  const name = (rawName || "").trim();
  if (!name) return "Filename can't be empty.";
  if (/[\/\\]/.test(name) || name.includes("..")) return "Filename can't contain slashes or \"..\".";

  const entry = State.selectedLangEntry;
  const hasExt = entry.extensions.some((ext) => name.toLowerCase().endsWith(ext));
  if (!hasExt) return `Must end with one of: ${entry.extensions.join(", ")}`;

  const key = name.toLowerCase();
  if (existingLower.includes(key)) return `"${name}" already exists in ${State.selectedFolder}/.`;
  if ((seenCounts.get(key) || 0) > 1) return `"${name}" is used more than once in this batch.`;

  return null;
}

function batchFilePreviewHtml(title, description) {
  return `
    <div><strong>Title:</strong> ${title || "— not detected —"}</div>
    <div><strong>Description:</strong> ${description || "— not detected —"}</div>
  `;
}

// Builds the same "no title/description detected — fill these in and
// insert them at the top" box the single-file review shows
// (#no-comment-helper), scoped to one batch entry. Only shown while
// that file has no detected title, same as the single-file version.
function buildBatchFileHelper(entry, onInsert) {
  const box = el("div", "helper-box");

  const hint = el("p", "field-hint", "No title/description comment detected. Fill these in and insert them at the top:");
  hint.style.marginTop = "0";

  const titleInput = el("input", "editor-input");
  titleInput.type = "text";
  titleInput.placeholder = "Program title";

  const descInput = el("input", "editor-input");
  descInput.type = "text";
  descInput.placeholder = "Short description";
  descInput.style.marginTop = "8px";

  const insertBtn = el("button", "action-btn", "INSERT");
  insertBtn.type = "button";
  insertBtn.style.marginTop = "10px";
  insertBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    if (!title) return;
    const description = descInput.value.trim();

    const prefix = commentPrefixForFolder();
    const lines = [`${prefix} ${title}`];
    if (description) lines.push(`${prefix} ${description}`);
    lines.push("");

    entry.code = lines.join("\n") + entry.code;
    onInsert();
  });

  box.appendChild(hint);
  box.appendChild(titleInput);
  box.appendChild(descInput);
  box.appendChild(insertBtn);

  return box;
}

function renderBatchList() {
  const list = $("batch-list");
  list.innerHTML = "";

  const existingLower = existingFilesInFolder();
  const seenCounts = new Map();
  State.batchFiles.forEach((entry) => {
    const key = entry.filename.trim().toLowerCase();
    seenCounts.set(key, (seenCounts.get(key) || 0) + 1);
  });

  State.batchFiles.forEach((entry, index) => {
    entry.error = validateBatchFilename(entry.filename, existingLower, seenCounts);

    const item = el("div", `batch-file-item${entry.error ? " batch-file-error" : ""}`);

    const head = el("div", "batch-file-head");

    const orderBox = el("div", "batch-file-order");
    const upBtn = el("button", "", "↑");
    upBtn.type = "button";
    upBtn.disabled = index === 0;
    upBtn.onclick = () => moveBatchFile(index, -1);
    const downBtn = el("button", "", "↓");
    downBtn.type = "button";
    downBtn.disabled = index === State.batchFiles.length - 1;
    downBtn.onclick = () => moveBatchFile(index, 1);
    orderBox.appendChild(upBtn);
    orderBox.appendChild(downBtn);

    const numberBadge = el("span", "serial-badge", String(index + 1));

    const nameInput = el("input", "editor-input batch-file-name-input");
    nameInput.type = "text";
    nameInput.value = entry.filename;
    nameInput.addEventListener("input", () => {
      entry.filename = nameInput.value;
      // Re-run validation across the whole batch (a rename can create
      // or resolve a duplicate elsewhere in the list) without losing
      // focus on the field being typed in.
      const stillFocused = document.activeElement === nameInput;
      const caret = nameInput.selectionStart;
      renderBatchList();
      if (stillFocused) {
        const refreshed = list.querySelectorAll(".batch-file-name-input")[index];
        if (refreshed) {
          refreshed.focus();
          refreshed.setSelectionRange(caret, caret);
        }
      }
    });

    const removeBtn = el("button", "action-btn batch-file-remove", "REMOVE");
    removeBtn.type = "button";
    removeBtn.onclick = () => removeBatchFile(index);

    head.appendChild(orderBox);
    head.appendChild(numberBadge);
    head.appendChild(nameInput);
    head.appendChild(removeBtn);

    let { title, description } = parseTitleDescription(entry.code);
    const meta = el("div", "batch-file-meta", batchFilePreviewHtml(title, description));

    let helperBox = title ? null : buildBatchFileHelper(entry, () => renderBatchList());

    const toggleBtn = el("button", "batch-file-code-toggle", "Show / edit code");
    toggleBtn.type = "button";

    const textarea = el("textarea", "code-textarea");
    textarea.spellcheck = false;
    textarea.style.display = "none";
    textarea.value = entry.code;
    textarea.addEventListener("input", () => {
      entry.code = textarea.value;
      const preview = parseTitleDescription(entry.code);
      meta.innerHTML = batchFilePreviewHtml(preview.title, preview.description);

      // Title just got typed/pasted directly into the code — the
      // helper box is no longer needed, drop it rather than leaving a
      // stale "no title detected" prompt on screen.
      if (preview.title && helperBox) {
        helperBox.remove();
        helperBox = null;
      }
    });

    toggleBtn.addEventListener("click", () => {
      const showing = textarea.style.display !== "none";
      textarea.style.display = showing ? "none" : "block";
      toggleBtn.textContent = showing ? "Show / edit code" : "Hide code";
    });

    item.appendChild(head);
    if (entry.error) {
      item.appendChild(el("div", "batch-file-error-text", entry.error));
    }
    item.appendChild(meta);
    if (helperBox) item.appendChild(helperBox);
    item.appendChild(toggleBtn);
    item.appendChild(textarea);

    list.appendChild(item);
  });

  const saveBtn = $("step3-save");
  if (State.batchMode) {
    saveBtn.textContent = `SAVE ${State.batchFiles.length} FILE${State.batchFiles.length === 1 ? "" : "S"} TO GITHUB`;
  }

  const errorBanner = $("batch-review-error");
  const anyError = State.batchFiles.some((f) => f.error);
  if (anyError) {
    errorBanner.textContent = "Fix the highlighted filenames before saving — each must be unique in this batch and in the folder, and use a valid extension for this language.";
    errorBanner.style.display = "block";
  } else {
    errorBanner.style.display = "none";
  }
}

function moveBatchFile(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= State.batchFiles.length) return;
  const [item] = State.batchFiles.splice(index, 1);
  State.batchFiles.splice(newIndex, 0, item);
  renderBatchList();
}

function removeBatchFile(index) {
  State.batchFiles.splice(index, 1);
  updateBatchInputStatus();

  if (!State.batchFiles.length) {
    // Nothing left to review — bounce back to Step 2 so they can add
    // more instead of showing an empty review screen.
    showSingleReview();
    goToStep(2);
    return;
  }

  renderBatchList();
}

// ---------------------------------------------------------------
// Step 3: review
// ---------------------------------------------------------------

function commentPrefixForFolder() {
  return State.selectedLangEntry?.id === "python" ? "#" : "//";
}

function parseTitleDescription(code) {
  const lines = code.split(/\r?\n/);
  const comments = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      const clean = trimmed
        .replace(/^\/\/\s*/, "")
        .replace(/^\/\*\s*/, "")
        .replace(/\*\/$/, "")
        .replace(/^\*\s*/, "")
        .trim();
      if (clean) comments.push(clean);
      if (comments.length === 2) break;
    } else if (trimmed.startsWith("#")) {
      const clean = trimmed.replace(/^#\s*/, "").trim();
      if (clean) comments.push(clean);
      if (comments.length === 2) break;
    } else {
      break;
    }
  }

  return { title: comments[0] || null, description: comments[1] || null };
}

function updateReviewPreview() {
  const code = $("code-textarea").value;
  const { title, description } = parseTitleDescription(code);

  $("preview-title").textContent = title || "— not detected —";
  $("preview-desc").textContent = description || "— not detected —";

  $("no-comment-helper").style.display = title ? "none" : "block";
  $("python-warning").style.display = commentPrefixForFolder() === "#" ? "block" : "none";
}

function initStep3() {
  $("code-textarea").addEventListener("input", updateReviewPreview);
  $("step3-back").addEventListener("click", () => goToStep(2));
  $("step3-save").addEventListener("click", saveProgram);

  $("helper-insert").addEventListener("click", () => {
    const title = $("helper-title").value.trim();
    const desc = $("helper-desc").value.trim();
    if (!title) return;

    const prefix = commentPrefixForFolder();
    const lines = [`${prefix} ${title}`];
    if (desc) lines.push(`${prefix} ${desc}`);
    lines.push("");

    const textarea = $("code-textarea");
    textarea.value = lines.join("\n") + textarea.value;
    updateReviewPreview();
  });
}

async function saveProgram() {
  if (State.batchMode) {
    await saveBatchProgram();
    return;
  }

  const errorEl = $("save-error");
  errorEl.style.display = "none";

  const saveBtn = $("step3-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "SAVING…";

  try {
    const res = await fetch("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode: getAccessCode(),
        folder: State.selectedFolder,
        filename: State.filename,
        code: $("code-textarea").value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Unknown error");
    }

    // Keep the local file list in sync so Manage Files reflects the
    // new file without needing a refetch.
    if (!State.searchIndex[State.selectedFolder]) {
      State.searchIndex[State.selectedFolder] = [];
    }
    State.searchIndex[State.selectedFolder].push({ file: State.filename });

    $("done-text").textContent = `Saved as ${data.path}.`;
    goToStep(4);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "SAVE TO GITHUB";
  }
}

// Posts every file in State.batchFiles to /api/batch-commit in one
// request, which lands them all in exactly one GitHub commit (see
// api/batch-commit.js) — so uploading, say, 10 finished programs only
// triggers one GitHub Actions run / one Vercel deploy, not 10.
async function saveBatchProgram() {
  const errorEl = $("save-error");
  errorEl.style.display = "none";

  // Re-validate against whatever's currently in the fields (a rename
  // or a removal elsewhere could have changed things) before sending.
  renderBatchList();
  if (State.batchFiles.some((f) => f.error)) {
    errorEl.textContent = "Fix the file errors above before saving.";
    errorEl.style.display = "block";
    return;
  }
  if (!State.batchFiles.length) return;

  const saveBtn = $("step3-save");
  const count = State.batchFiles.length;
  saveBtn.disabled = true;
  saveBtn.textContent = "SAVING…";

  try {
    const res = await fetch("/api/batch-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode: getAccessCode(),
        folder: State.selectedFolder,
        files: State.batchFiles.map((f) => ({
          filename: f.filename.trim(),
          code: f.code,
        })),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Unknown error");
    }

    if (!State.searchIndex[State.selectedFolder]) {
      State.searchIndex[State.selectedFolder] = [];
    }
    (data.committed || []).forEach((filename) => {
      State.searchIndex[State.selectedFolder].push({ file: filename });
    });

    $("done-text").textContent =
      `Saved ${data.committed.length} file${data.committed.length === 1 ? "" : "s"} in a single commit.`;
    goToStep(4);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = `SAVE ${count} FILE${count === 1 ? "" : "S"} TO GITHUB`;
  }
}

// ---------------------------------------------------------------
// Step 4: reset
// ---------------------------------------------------------------

function initStep4() {
  $("add-another").addEventListener("click", resetWizard);
  $("done-menu-btn").addEventListener("click", goHome);
}

// "Add another" keeps the same language folder selected (that's the
// context the person is already working in) and jumps back to the
// filename step, rather than clearing everything back to step 1.
function resetWizard() {
  State.filename = "";
  State.images = [];
  State.imageTexts = [];
  State.mergeNotes = [];
  State.batchFiles = [];

  $("filename-input").value = "";
  $("filename-status").style.display = "none";
  $("image-list").innerHTML = "";
  $("code-textarea").value = "";
  $("merge-notes").innerHTML = "";
  $("batch-list").innerHTML = "";
  $("batch-input-status").textContent = "No files chosen";
  $("batch-required-warning").style.display = "none";
  showSingleReview();
  updateImageInputStatus();
  updateNextEnabled();

  if (State.selectedFolder) {
    goToStep(2);
  } else {
    document.querySelectorAll(".lang-card").forEach((c) => c.classList.remove("selected"));
    goToStep(1);
  }
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initWizardTopbar();
  initStep2();
  initStep3();
  initStep4();
});
