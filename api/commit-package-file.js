// api/commit-package-file.js
//
// Adds one or more new source files to an *existing* package —
// packages/<folder>/<package>/<filename> for each — in a single commit.
// Same Git Data API pattern as commit-package.js / batch-commit.js.
// Doesn't touch meta.json: the package's name/description are
// unaffected by adding a file to it.
//
// Body: { accessCode, folder, package, files: [{ filename, code }, ...] }
//   folder  - language folder, e.g. "Java"
//   package - the existing package's own folder name, e.g. "GreeterDemo"
//   files   - new source files to add to that package

const path = require("path");
const { sanitizeFilename, sanitizeFolder, loadLanguages, findLanguageForFolder } = require("./_lib");

const MAX_FILES_PER_REQUEST = 20;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, package: packageFolder, files } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  const cleanPackageFolder = sanitizeFilename(packageFolder);
  if (!cleanPackageFolder || !/^[A-Za-z0-9_-]+$/.test(cleanPackageFolder)) {
    res.status(400).json({ error: "Invalid package folder" });
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files must be a non-empty array" });
    return;
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    res.status(400).json({ error: `Too many files in one request (max ${MAX_FILES_PER_REQUEST}).` });
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
      res.status(400).json({ error: `Duplicate filename in this request: ${cleanFilename}` });
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
  const packagePath = `packages/${cleanFolder}/${cleanPackageFolder}`;

  try {
    // 1. The package (and its meta.json) must already exist.
    const metaRes = await fetch(
      `${apiBase}/contents/${packagePath}/meta.json?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );
    if (metaRes.status === 404) {
      res.status(404).json({ error: `No package found at ${packagePath}/.` });
      return;
    }
    if (!metaRes.ok) {
      throw new Error(`Unable to check the package exists: ${await metaRes.text()}`);
    }

    // 2. Existing files in that package, to reject collisions with a
    //    clear error rather than silently overwriting.
    const listRes = await fetch(
      `${apiBase}/contents/${packagePath}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );
    if (!listRes.ok) {
      throw new Error(`Unable to list the package's existing files: ${await listRes.text()}`);
    }
    const existingEntries = await listRes.json();
    const existingNames = new Set(
      (Array.isArray(existingEntries) ? existingEntries : [])
        .map((e) => e.name.toLowerCase())
    );

    const collision = cleanFiles.find((f) => existingNames.has(f.filename.toLowerCase()));
    if (collision) {
      res.status(409).json({
        error: `"${collision.filename}" already exists in this package.`,
      });
      return;
    }

    // 3. Latest commit + tree on the branch
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

    // 4. One tree with just the new files
    const treeEntries = cleanFiles.map((f) => ({
      path: `${packagePath}/${f.filename}`,
      mode: "100644",
      type: "blob",
      content: f.code,
    }));

    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      throw new Error(`Unable to build tree: ${await treeRes.text()}`);
    }
    const treeData = await treeRes.json();

    // 5. Commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: add ${cleanFiles.length} file${cleanFiles.length === 1 ? "" : "s"} to package ${cleanFolder}/${cleanPackageFolder}/`,
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
      packageFolder: cleanPackageFolder,
      files: cleanFiles.map((f) => f.filename),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
