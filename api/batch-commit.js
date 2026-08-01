// api/batch-commit.js
//
// Adds multiple new program files to one language folder in a single
// Git commit. Uses the same lower-level Git Data API as batch-save.js
// (blobs -> tree -> commit -> ref update) — just for *additions*
// instead of deletions — so uploading N finished code files only
// triggers one GitHub Actions run / one Vercel deploy, not N.
//
// Server-side only. Uses the same env vars as commit.js / batch-save.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, files: [{ filename, code }, ...] }
//   folder  - language folder, e.g. "C" (matches programs/<folder>/)
//   files   - new files to add, in the order they should appear in
//             the UI; appended to the end of that folder's existing
//             generated/order.json entry (existing files keep their
//             current relative order).

const fs = require("fs");
const path = require("path");

function sanitizeFilename(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (/[\/\\]/.test(trimmed)) return null;      // no path separators
  if (trimmed.includes("..")) return null;      // no traversal
  if (/[\x00-\x1f]/.test(trimmed)) return null; // no control chars
  if (trimmed.length > 200) return null;
  return trimmed;
}

function sanitizeFolder(folder) {
  if (typeof folder !== "string") return null;
  if (/[\/\\]/.test(folder)) return null;
  if (folder.includes("..")) return null;
  return folder;
}

function loadLanguages() {
  const candidates = [
    path.join(process.cwd(), "scripts", "languages.json"),
    path.join(__dirname, "..", "scripts", "languages.json"),
    path.join(process.cwd(), "languages.json"), // fallback if ever moved to root
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error("languages.json not found in scripts/ or repo root");
}

// Keeps a single commit's tree (and the request payload) from growing
// unbounded. Raise this if you genuinely need bigger batches.
const MAX_FILES_PER_BATCH = 50;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, files } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid folder" });
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files must be a non-empty array" });
    return;
  }

  if (files.length > MAX_FILES_PER_BATCH) {
    res.status(400).json({
      error: `Too many files in one batch (max ${MAX_FILES_PER_BATCH}). Split into smaller batches.`,
    });
    return;
  }

  let languages;
  try {
    languages = loadLanguages();
  } catch {
    res.status(500).json({ error: "Unable to load languages.json on the server" });
    return;
  }

  const normalizedFolder = cleanFolder.toLowerCase();
  const langEntry = Object.values(languages).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalizedFolder)
  );

  if (!langEntry) {
    res.status(400).json({ error: "Unknown language folder" });
    return;
  }

  // Validate + sanitize every file up front — all or nothing, so a
  // single bad entry doesn't produce a partial commit.
  const cleanFiles = [];
  const seenNames = new Set();

  for (const f of files) {
    const cleanFilename = sanitizeFilename(f && f.filename);
    if (!cleanFilename) {
      res.status(400).json({ error: `Invalid filename: ${f && f.filename}` });
      return;
    }

    const ext = path.extname(cleanFilename).toLowerCase();
    if (!langEntry.extensions.includes(ext)) {
      res.status(400).json({
        error: `"${cleanFilename}" must end with one of: ${langEntry.extensions.join(", ")}`,
      });
      return;
    }

    const key = cleanFilename.toLowerCase();
    if (seenNames.has(key)) {
      res.status(400).json({ error: `Duplicate filename in this batch: ${cleanFilename}` });
      return;
    }
    seenNames.add(key);

    if (typeof (f && f.code) !== "string" || !f.code.trim()) {
      res.status(400).json({ error: `"${cleanFilename}" has no code` });
      return;
    }

    cleanFiles.push({ filename: cleanFilename, code: f.code });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    res.status(500).json({ error: "Server is missing GitHub configuration" });
    return;
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    // 1. Authoritative existence check against the real folder
    //    contents — catches races / drift that trusting order.json
    //    alone could miss.
    const dirRes = await fetch(
      `${apiBase}/contents/programs/${encodeURIComponent(cleanFolder)}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );

    let existingNames = new Set();
    if (dirRes.status === 200) {
      const dirData = await dirRes.json();
      if (Array.isArray(dirData)) {
        existingNames = new Set(dirData.map((e) => e.name.toLowerCase()));
      }
    } else if (dirRes.status !== 404) {
      throw new Error(`Unable to read folder contents: ${await dirRes.text()}`);
    }

    const conflicts = cleanFiles
      .filter((f) => existingNames.has(f.filename.toLowerCase()))
      .map((f) => f.filename);

    if (conflicts.length) {
      res.status(409).json({
        error: `These filenames already exist in ${cleanFolder}/: ${conflicts.join(", ")}. Rename them and try again.`,
      });
      return;
    }

    // 2. Latest commit + tree on the branch
    const refRes = await fetch(`${apiBase}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });
    if (!refRes.ok) {
      throw new Error(`Unable to read branch ref: ${await refRes.text()}`);
    }
    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    const commitRes = await fetch(`${apiBase}/git/commits/${baseCommitSha}`, {
      headers: ghHeaders,
    });
    if (!commitRes.ok) {
      throw new Error(`Unable to read base commit: ${await commitRes.text()}`);
    }
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Read the current generated/order.json so only this folder's
    //    key changes — every other folder's order is left untouched —
    //    and append the new files to the end of its existing order.
    let currentOrderJson = {};
    const orderRes = await fetch(
      `${apiBase}/contents/generated/order.json?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );
    if (orderRes.status === 200) {
      const orderFile = await orderRes.json();
      try {
        currentOrderJson = JSON.parse(
          Buffer.from(orderFile.content, "base64").toString("utf8")
        );
      } catch {
        currentOrderJson = {};
      }
    } else if (orderRes.status !== 404) {
      throw new Error(`Unable to read order.json: ${await orderRes.text()}`);
    }

    const existingOrder = Array.isArray(currentOrderJson[cleanFolder])
      ? currentOrderJson[cleanFolder]
      : [];

    const newOrder = existingOrder.concat(
      cleanFiles.map((f) => f.filename).filter((name) => !existingOrder.includes(name))
    );

    currentOrderJson[cleanFolder] = newOrder;

    // 4. Build one tree with every new file's blob plus the updated
    //    order.json — the Git Data API accepts UTF-8 `content`
    //    directly on a tree entry and creates the blob for us, no
    //    separate blob-creation calls needed.
    const treeEntries = cleanFiles.map((f) => ({
      path: `programs/${cleanFolder}/${f.filename}`,
      mode: "100644",
      type: "blob",
      content: f.code,
    }));

    treeEntries.push({
      path: "generated/order.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(currentOrderJson, null, 2) + "\n",
    });

    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    });
    if (!treeRes.ok) {
      throw new Error(`Unable to build tree: ${await treeRes.text()}`);
    }
    const treeData = await treeRes.json();

    // 5. One commit for everything
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: add ${cleanFiles.length} file${cleanFiles.length === 1 ? "" : "s"} to ${cleanFolder}/`,
        tree: treeData.sha,
        parents: [baseCommitSha],
      }),
    });
    if (!newCommitRes.ok) {
      throw new Error(`Unable to create commit: ${await newCommitRes.text()}`);
    }
    const newCommitData = await newCommitRes.json();

    // 6. Move the branch ref forward
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommitData.sha, force: false }),
    });
    if (!updateRefRes.ok) {
      const errText = await updateRefRes.text();
      throw new Error(
        `Unable to update ${branch} (someone may have pushed in the meantime): ${errText}`
      );
    }

    res.status(200).json({
      ok: true,
      commitUrl: newCommitData.html_url || null,
      folder: cleanFolder,
      committed: cleanFiles.map((f) => f.filename),
      order: newOrder,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
