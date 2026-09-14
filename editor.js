// editor.js

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

// Same key script.js uses on the home page — sessionStorage (not
// localStorage) so it survives navigating here but is gone the moment
// the tab closes, never written to disk.
const EDITOR_SESSION_KEY = "lr_editor_session_code";

const State = {
  languages: null,      // generated/language-index.json content (array)
  languageIndex: [],    // generated/language-index.json content
  searchIndex: {},      // generated/search-index.json content (for duplicate checks against existing filenames)
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

  // ---- Add Package / Add File to Package (see enterPackageWizard /
  // enterPackageFileWizard below) ----
  pkgFolder: null,        // language folder the new package belongs to, e.g. "Java"
  pkgLangEntry: null,
  pkgFileRows: [],        // [{ id, el, filenameInput, textarea, errorEl }]
  createdPackageFolder: null,

  pkgFileTargetFolder: null,   // language folder of the package a file is being added to
  pkgFileTargetPackage: null,  // that package's own folder name
  pkgFileLangEntry: null,
  pkgFileAddRows: [],          // same shape as pkgFileRows, kept separate so the two wizards never share state
};

let tesseractLoadPromise = null;

// ---------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------

function $(id) {
  return document.getElementById(id);
}

// el(tag, className, text) — `text` is always set via textContent, so
// whatever string you pass can never be interpreted as markup. This is
// the one to reach for anywhere the string might ultimately trace back
// to user- or file-supplied content (a filename, a title, an error
// message that echoes one back, etc.) — which in this editor is most
// places.
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// elHtml(tag, className, html) — the explicit "this is real markup"
// escape hatch, for the rare case where the string itself contains
// tags we want rendered (e.g. batchFilePreviewHtml()'s <strong>
// labels). Anything user/file-derived interpolated into that markup
// must already be escaped by the caller before it reaches here — never
// pass raw user content into this directly.
function elHtml(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// Escapes HTML special characters. Needed anywhere a title/description
// (or anything else pulled from a submitted file's content) gets built
// into an HTML string for innerHTML — those values are just whatever
// text was in the file, not markup, and must never be interpreted as
// tags/attributes. All the other el(...) calls in this file pass in
// static strings we wrote ourselves, so they don't need this.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode"); // "package" | "package-file" | null (= add program)
  const folderParam = params.get("folder");

  if (mode === "package") {
    await enterPackageWizard(folderParam);
    return;
  }

  if (mode === "package-file") {
    await enterPackageFileWizard(folderParam, params.get("package"));
    return;
  }

  revealSection($("wizard"));
  preloadTesseract();

  try {
    await ensureSiteDataLoaded();
  } catch (err) {
    showWizardError("Failed to load site data: " + err.message);
    return;
  }

  buildLangGrid();

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
  updateEditorLanguageUI(lang);
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
  updateEditorLanguageUI(lang);
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

function updateEditorLanguageUI(lang) {
    const subtitle = $("editor-subtitle");
    const input = $("filename-input");

    subtitle.textContent =
        `Upload screenshots or paste code to add a new ${lang.displayName} program.`;

    const placeholders = {
        "C": "e.g. BubbleSort.c",
        "Java": "e.g. BubbleSort.java",
        "Python": "e.g. bubble_sort.py"
    };

    input.placeholder =
        placeholders[lang.displayName] || "e.g. MyProgram";
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
  // Each image's url was created with URL.createObjectURL() in
  // addImageFiles() — that blob stays alive in memory for the life of
  // the tab unless explicitly revoked, so release it here rather than
  // just dropping our only reference to it.
  const [removed] = State.images.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.url);

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
  $("step3-save").textContent = "SAVE";
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
  const safeTitle = title ? escapeHtml(title) : "— not detected —";
  const safeDescription = description ? escapeHtml(description) : "— not detected —";

  return `
    <div><strong>Title:</strong> ${safeTitle}</div>
    <div><strong>Description:</strong> ${safeDescription}</div>
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

    entry.code = lines.join("\n") + "\n\n" + entry.code;
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
    const meta = elHtml("div", "batch-file-meta", batchFilePreviewHtml(title, description));

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
      // entry.error can echo back the raw filename the person picked
      // (e.g. `"<name>" already exists in ...`) — safe now because
      // el() renders this text via textContent by default.
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
    saveBtn.textContent =`SAVE ${State.batchFiles.length} FILE${State.batchFiles.length === 1 ? "" : "S"}`;
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
  return State.selectedLangEntry?.comments?.line?.[0] || "//";
}

function parseTitleDescription(code) {
  const lines = code.split(/\r?\n/);
  const comments = [];

  const langComments = State.selectedLangEntry?.comments;
  const lineMarkers = langComments?.line || ["//"];
  const blockMarkers = langComments?.block || ["/*", "*/"];
  const [blockOpen, blockClose] = blockMarkers;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const isLineComment = lineMarkers.some(marker => trimmed.startsWith(marker));
    const isBlockComment = blockOpen && (trimmed.startsWith(blockOpen) || trimmed.startsWith("*"));

    if (isLineComment || isBlockComment) {
      let clean = trimmed;

      for (const marker of lineMarkers) {
        if (clean.startsWith(marker)) {
          clean = clean.slice(marker.length).trim();
          break;
        }
      }
      if (blockOpen && clean.startsWith(blockOpen)) clean = clean.slice(blockOpen.length).trim();
      if (blockClose && clean.endsWith(blockClose)) clean = clean.slice(0, -blockClose.length).trim();
      if (blockOpen && clean.startsWith("*")) clean = clean.slice(1).trim();

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

    const textarea = $("code-textarea");
    textarea.value = lines.join("\n") + "\n\n" + textarea.value;
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

    // Keep the local file list in sync so the next duplicate-filename
    // check sees this file without needing a refetch.
    if (!State.searchIndex[State.selectedFolder]) {
      State.searchIndex[State.selectedFolder] = [];
    }
    State.searchIndex[State.selectedFolder].push({ file: State.filename });

    saveBtn.textContent = "✓ SAVED!";

    await new Promise(resolve => setTimeout(resolve, 1000));

    $("done-text").textContent = `Saved as ${data.path}.`;

    goToStep(4);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "SAVE";
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

    saveBtn.textContent = "✓ SAVED!";

await new Promise(resolve => setTimeout(resolve, 1000));

$("done-text").textContent =
`Saved ${data.committed.length} file${data.committed.length === 1 ? "" : "s"} in a single save.`;

goToStep(4);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent =
`SAVE ${count} FILE${count === 1 ? "" : "S"}`;
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
  // Same reasoning as removeImage() — anything still in State.images at
  // this point still has a live blob backing it, and we're about to
  // drop every reference to it.
  State.images.forEach((img) => URL.revokeObjectURL(img.url));

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
// Add Package (?mode=package&folder=<Language>)
// ---------------------------------------------------------------
//
// A trimmed-down sibling of the program wizard above: no OCR, no
// batch-upload — just a package name/description and a small set of
// hand-entered files (filename + code each), committed together in one
// request to /api/commit-package. Packages aren't part of the
// reorder/edit/commit system programs use, so this deliberately doesn't
// reuse any of that code; it talks to its own endpoint instead.

// Builds one filename+code row and appends it to both `container` (the
// DOM) and `rows` (the tracking array) — shared by the Add Package and
// Add File to Package wizards, which each keep their own `rows` array.
function buildPkgFileRow(container, rows, langEntry) {
  const id = uid();

  const row = el("div", "pkg-file-row");
  row.dataset.id = id;

  const head = el("div", "pkg-file-row-head");

  const filenameInput = document.createElement("input");
  filenameInput.type = "text";
  filenameInput.className = "editor-input";
  const exampleExt = langEntry?.extensions?.[0] || "";
  filenameInput.placeholder = `Filename (e.g. Greeter${exampleExt})`;

  const removeBtn = el("button", "action-btn batch-file-remove", "REMOVE");
  removeBtn.type = "button";
  removeBtn.addEventListener("click", () => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx !== -1) rows.splice(idx, 1);
    row.remove();
  });

  head.appendChild(filenameInput);
  head.appendChild(removeBtn);

  const textarea = document.createElement("textarea");
  textarea.className = "code-textarea";
  textarea.spellcheck = false;
  textarea.placeholder = "Paste or type this file's code here…";

  const errorEl = el("div", "pkg-file-row-error");
  errorEl.style.display = "none";

  row.appendChild(head);
  row.appendChild(textarea);
  row.appendChild(errorEl);
  container.appendChild(row);

  const entry = { id, el: row, filenameInput, textarea, errorEl };
  rows.push(entry);
  return entry;
}

// Validates every row with content, skipping fully-blank rows (so an
// unused extra row someone added and then didn't fill in doesn't block
// saving). Returns { files, error } — error is a { row, message } pair
// naming the offending row, or null if everything checked out.
function collectPkgFiles(rows, langEntry) {
  const files = [];
  const seen = new Set();

  for (const row of rows) {
    row.errorEl.style.display = "none";

    const filename = row.filenameInput.value.trim();
    const code = row.textarea.value;

    if (!filename && !code.trim()) continue; // untouched extra row

    if (!filename) {
      return { files: null, error: { row, message: "Filename is required." } };
    }

    const dot = filename.lastIndexOf(".");
    const ext = dot === -1 ? "" : filename.slice(dot).toLowerCase();

    if (!ext || !langEntry.extensions.includes(ext)) {
      return {
        files: null,
        error: {
          row,
          message: `Filename must end with one of: ${langEntry.extensions.join(", ")}`,
        },
      };
    }

    if (!code.trim()) {
      return { files: null, error: { row, message: "Code is empty." } };
    }

    const key = filename.toLowerCase();
    if (seen.has(key)) {
      return { files: null, error: { row, message: "Duplicate filename in this batch." } };
    }
    seen.add(key);

    files.push({ filename, code });
  }

  return { files, error: null };
}

function findLangEntryForFolder(folder) {
  const normalized = (folder || "").toLowerCase();
  return Object.values(State.languages || {}).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalized)
  ) || null;
}

// Turns a package display name into a safe, file-system-friendly folder
// name (letters/numbers only, spaces stripped) — e.g. "Greeter Demo" ->
// "GreeterDemo". Only used to *pre-fill* the folder-name field; the
// person can still edit it before saving.
function slugifyPackageFolder(name) {
  return (name || "").replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 60);
}

function showPkgError(message) {
  const box = $("pkg-wizard-error");
  box.textContent = message;
  box.style.display = "block";
}

function clearPkgError() {
  $("pkg-wizard-error").style.display = "none";
  $("pkg-save-error").style.display = "none";
}

function goToPkgStep(n) {
  document.querySelectorAll("#package-wizard .step-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  $(`pkg-step-${n}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Returns to this language's Packages view (not just Home) — same idea
// as goHome() for the program wizard, so saving (or bailing out) drops
// the person back where they were working instead of the plain homepage.
function pkgGoHome(focusPackage) {
  const folder = State.pkgFolder;
  if (!folder) {
    window.location.href = "index.html";
    return;
  }
  const params = new URLSearchParams({ folder, mode: "package" });
  if (focusPackage) params.set("package", focusPackage);
  window.location.href = `index.html?${params.toString()}`;
}

async function enterPackageWizard(folderParam) {
  revealSection($("package-wizard"));
  $("editor-title").textContent = "ADD PACKAGE";
  document.title = "LabRecord – Add Package";
  $("editor-subtitle").textContent = "Add a new multi-file package to a language's Packages view.";

  try {
    await ensureSiteDataLoaded();
  } catch (err) {
    showPkgError("Failed to load site data: " + err.message);
    return;
  }

  const langEntry = findLangEntryForFolder(folderParam);
  const displayLang = State.languageIndex.find((l) => l.folder === folderParam);

  if (!folderParam || !langEntry || !displayLang) {
    showPkgError(
      "No language folder specified. Go back and use the packages toggle's [ + ] button on a language's page."
    );
    return;
  }

  State.pkgFolder = folderParam;
  State.pkgLangEntry = langEntry;

  $("pkg-lang-label").textContent = `(${displayLang.displayName})`;
  $("pkg-path-preview").textContent = `packages/${folderParam}/<PackageFolder>/`;

  $("pkg-name-input").value = "";
  $("pkg-folder-input").value = "";
  $("pkg-desc-input").value = "";
  $("pkg-file-rows").innerHTML = "";
  State.pkgFileRows = [];

  // Start with two rows — most packages are at least "a class" + "a
  // runner that uses it" — the person can add more or remove down to
  // whatever they actually need.
  buildPkgFileRow($("pkg-file-rows"), State.pkgFileRows, langEntry);
  buildPkgFileRow($("pkg-file-rows"), State.pkgFileRows, langEntry);

  goToPkgStep(1);
}

async function submitPackage() {
  clearPkgError();

  const name = $("pkg-name-input").value.trim();
  const folderSlug = $("pkg-folder-input").value.trim();
  const description = $("pkg-desc-input").value.trim();

  if (!name) return showPkgError("Package name is required.");

  if (!/^[A-Za-z0-9_-]+$/.test(folderSlug)) {
    return showPkgError(
      "Folder name can only contain letters, numbers, hyphens and underscores."
    );
  }

  const { files, error } = collectPkgFiles(State.pkgFileRows, State.pkgLangEntry);

  if (error) {
    error.row.errorEl.textContent = error.message;
    error.row.errorEl.style.display = "block";
    error.row.el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (!files || files.length === 0) {
    return showPkgError("Add at least one file.");
  }

  const saveBtn = $("pkg-step1-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "SAVING…";

  try {
    const res = await fetch("/api/commit-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode: getAccessCode(),
        folder: State.pkgFolder,
        packageName: name,
        packageFolder: folderSlug,
        description,
        files,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");

    State.createdPackageFolder = folderSlug;
    $("pkg-done-text").textContent =
      `"${name}" was added at packages/${State.pkgFolder}/${folderSlug}/.`;
    goToPkgStep(2);
  } catch (err) {
    $("pkg-save-error").textContent = err.message;
    $("pkg-save-error").style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "CREATE PACKAGE";
  }
}

function initPackageWizard() {
  $("pkg-name-input").addEventListener("input", () => {
    // Only auto-fill the folder field while the person hasn't
    // customized it themselves yet — once they've typed into it
    // directly, their choice sticks even if they keep editing the name.
    if (!$("pkg-folder-input").dataset.touched) {
      $("pkg-folder-input").value = slugifyPackageFolder($("pkg-name-input").value);
    }
  });

  $("pkg-folder-input").addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
  });

  $("pkg-add-file-row").addEventListener("click", () => {
    buildPkgFileRow($("pkg-file-rows"), State.pkgFileRows, State.pkgLangEntry)
      .el.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("pkg-step1-save").addEventListener("click", submitPackage);
  $("pkg-step1-back").addEventListener("click", () => pkgGoHome());
  $("pkg-menu-btn").addEventListener("click", () => pkgGoHome());
  $("pkg-done-menu-btn").addEventListener("click", () => pkgGoHome(State.createdPackageFolder));
}

// ---------------------------------------------------------------
// Add File to Package (?mode=package-file&folder=<Language>&package=<Folder>)
// ---------------------------------------------------------------

function showPkgFileError(message) {
  const box = $("pkgfile-wizard-error");
  box.textContent = message;
  box.style.display = "block";
}

function clearPkgFileError() {
  $("pkgfile-wizard-error").style.display = "none";
  $("pkgfile-save-error").style.display = "none";
}

function goToPkgFileStep(n) {
  document.querySelectorAll("#package-file-wizard .step-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  $(`pkgfile-step-${n}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function pkgFileGoHome() {
  const folder = State.pkgFileTargetFolder;
  const pkg = State.pkgFileTargetPackage;
  if (!folder) {
    window.location.href = "index.html";
    return;
  }
  const params = new URLSearchParams({ folder, mode: "package-file" });
  if (pkg) params.set("package", pkg);
  window.location.href = `index.html?${params.toString()}`;
}

async function enterPackageFileWizard(folderParam, packageParam) {
  revealSection($("package-file-wizard"));
  $("editor-title").textContent = "ADD FILE TO PACKAGE";
  document.title = "LabRecord – Add File to Package";
  $("editor-subtitle").textContent = "Add another source file to an existing package.";

  try {
    await ensureSiteDataLoaded();
  } catch (err) {
    showPkgFileError("Failed to load site data: " + err.message);
    return;
  }

  const langEntry = findLangEntryForFolder(folderParam);

  if (!folderParam || !packageParam || !langEntry) {
    showPkgFileError(
      "No package specified. Go back and use the [ + ] button while a package is open."
    );
    return;
  }

  State.pkgFileTargetFolder = folderParam;
  State.pkgFileTargetPackage = packageParam;
  State.pkgFileLangEntry = langEntry;

  let displayName = packageParam;
  try {
    const packagesIndex = await fetchJson("/generated/packages-index.json");
    const match = packagesIndex.find(
      (p) => p.languageFolder === folderParam && p.folder === packageParam
    );
    if (match) displayName = match.name;
  } catch {
    // Fall back to the raw folder name in the label — not fatal, the
    // server still authoritatively checks the package exists on save.
  }

  $("pkgfile-pkg-label").textContent = displayName;
  $("pkgfile-path-preview").textContent = `packages/${folderParam}/${packageParam}/`;

  $("pkgfile-file-rows").innerHTML = "";
  State.pkgFileAddRows = [];
  buildPkgFileRow($("pkgfile-file-rows"), State.pkgFileAddRows, langEntry);

  goToPkgFileStep(1);
}

async function submitPackageFile() {
  clearPkgFileError();

  const { files, error } = collectPkgFiles(State.pkgFileAddRows, State.pkgFileLangEntry);

  if (error) {
    error.row.errorEl.textContent = error.message;
    error.row.errorEl.style.display = "block";
    error.row.el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (!files || files.length === 0) {
    return showPkgFileError("Add at least one file.");
  }

  const saveBtn = $("pkgfile-step1-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "SAVING…";

  try {
    const res = await fetch("/api/commit-package-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessCode: getAccessCode(),
        folder: State.pkgFileTargetFolder,
        package: State.pkgFileTargetPackage,
        files,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");

    $("pkgfile-done-text").textContent =
      `Added ${files.map((f) => f.filename).join(", ")} to packages/${State.pkgFileTargetFolder}/${State.pkgFileTargetPackage}/.`;
    goToPkgFileStep(2);
  } catch (err) {
    $("pkgfile-save-error").textContent = err.message;
    $("pkgfile-save-error").style.display = "block";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "ADD TO PACKAGE";
  }
}

function initPackageFileWizard() {
  $("pkgfile-add-file-row").addEventListener("click", () => {
    buildPkgFileRow($("pkgfile-file-rows"), State.pkgFileAddRows, State.pkgFileLangEntry)
      .el.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("pkgfile-step1-save").addEventListener("click", submitPackageFile);
  $("pkgfile-step1-back").addEventListener("click", pkgFileGoHome);
  $("pkgfile-menu-btn").addEventListener("click", pkgFileGoHome);
  $("pkgfile-done-menu-btn").addEventListener("click", pkgFileGoHome);
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
  initPackageWizard();
  initPackageFileWizard();
});
