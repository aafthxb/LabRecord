// api/commit-package.js
//
// Creates a new package — programs/<folder>/packages/<packageFolder>/meta.json
// plus every submitted source file — in a single Git commit, using the
// same lower-level Git Data API as batch-commit.js (blobs -> tree ->
// commit -> ref update). No order.json involvement: unlike programs,
// packages aren't reordered/edited in-browser, so generate-index.js is
// the only thing that ever needs to know they exist, and it discovers
// them straight off disk on the next build.
//
// Server-side only. Uses the same env vars as commit.js / batch-commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, packageName, packageFolder, description, files: [{ filename, code }, ...] }
//   folder        - language folder, e.g. "Java" (matches programs/<folder>/ —
//                   a package's language is just whichever folder it lives
//                   under, same as programs)
//   packageFolder - the new package's own folder name, e.g. "GreeterDemo"
//                   (programs/<folder>/packages/<packageFolder>/)
//   packageName / description - written into that package's meta.json
//   files         - the package's source files, in the order they should
//                   appear on its file-cards page

const path = require("path");
const { sanitizeFilename, sanitizeFolder, loadLanguages, findLanguageForFolder } = require("./_lib");

const MAX_FILES_PER_PACKAGE = 50;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, packageName, packageFolder, description, files } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  // A package folder name follows the same rules as a filename
  // (no slashes, no traversal, no control characters) — it's just
  // being used as a directory name instead of a file name here.
  const cleanPackageFolder = sanitizeFilename(packageFolder);
  if (!cleanPackageFolder || !/^[A-Za-z0-9_-]+$/.test(cleanPackageFolder)) {
    res.status(400).json({
      error: "Package folder name must contain only letters, numbers, hyphens and underscores",
    });
    return;
  }

  const cleanName = typeof packageName === "string" ? packageName.trim() : "";
  if (!cleanName) {
    res.status(400).json({ error: "Package name is required" });
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files must be a non-empty array" });
    return;
  }

  if (files.length > MAX_FILES_PER_PACKAGE) {
    res.status(400).json({
      error: `Too many files in one package (max ${MAX_FILES_PER_PACKAGE}).`,
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

  const langEntry = findLanguageForFolder(languages, cleanFolder);
  if (!langEntry) {
    res.status(400).json({ error: "Unknown language folder" });
    return;
  }

  // Validate + sanitize every file up front — all or nothing.
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
      res.status(400).json({ error: `Duplicate filename in this package: ${cleanFilename}` });
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
  const packagePath = `programs/${cleanFolder}/packages/${cleanPackageFolder}`;

  try {
    // 1. Authoritative check that this package folder doesn't already
    //    exist — a same-named package under this language would silently
    //    merge/overwrite otherwise.
    const dirRes = await fetch(
      `${apiBase}/contents/${packagePath}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );

    if (dirRes.status === 200) {
      res.status(409).json({
        error: `A package already exists at ${packagePath}/. Choose a different folder name.`,
      });
      return;
    }
    if (dirRes.status !== 404) {
      throw new Error(`Unable to check for an existing package: ${await dirRes.text()}`);
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

    // 3. One tree: meta.json + every source file
    const meta = {
      name: cleanName,
      description: typeof description === "string" ? description.trim() : "",
    };

    const treeEntries = [
      {
        path: `${packagePath}/meta.json`,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(meta, null, 2) + "\n",
      },
      ...cleanFiles.map((f) => ({
        path: `${packagePath}/${f.filename}`,
        mode: "100644",
        type: "blob",
        content: f.code,
      })),
    ];

    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      throw new Error(`Unable to build tree: ${await treeRes.text()}`);
    }
    const treeData = await treeRes.json();

    // 4. One commit for everything
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: add package ${cleanFolder}/${cleanPackageFolder}/ (${cleanFiles.length} file${cleanFiles.length === 1 ? "" : "s"})`,
        tree: treeData.sha,
        parents: [baseCommitSha],
      }),
    });
    if (!newCommitRes.ok) {
      throw new Error(`Unable to create commit: ${await newCommitRes.text()}`);
    }
    const newCommitData = await newCommitRes.json();

    // 5. Move the branch ref forward
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
      packageFolder: cleanPackageFolder,
      files: cleanFiles.map((f) => f.filename),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
