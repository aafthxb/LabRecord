// api/delete-package.js
//
// Deletes an entire package — programs/<folder>/packages/<package>/ and
// everything in it (meta.json + every source file) — in a single
// commit. Uses the Git Data API's tree-based delete: passing `sha:
// null` for a path removes it from the resulting tree, so one tree
// covers the whole folder disappearing at once, same commit-shape
// philosophy as commit-package.js/batch-commit.js (one action, one
// commit, one Vercel deploy).
//
// Server-side only. Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, package }
//   folder  - language folder, e.g. "Java"
//   package - the package's own folder name, e.g. "GreeterDemo"

const { sanitizeFilename, sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, package: packageFolder } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  const cleanPackageFolder = sanitizeFilename(packageFolder);

  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }
  if (!cleanPackageFolder || !/^[A-Za-z0-9_-]+$/.test(cleanPackageFolder)) {
    res.status(400).json({ error: "Invalid package folder" });
    return;
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
    // 1. What's actually in this package right now — also doubles as
    //    the "does it even exist" check.
    const listRes = await fetch(
      `${apiBase}/contents/${packagePath}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );
    if (listRes.status === 404) {
      res.status(404).json({ error: `No package found at ${packagePath}/.` });
      return;
    }
    if (!listRes.ok) {
      throw new Error(`Unable to list the package's files: ${await listRes.text()}`);
    }
    const entries = await listRes.json();
    const fileEntries = (Array.isArray(entries) ? entries : []).filter((e) => e.type === "file");

    if (fileEntries.length === 0) {
      res.status(404).json({ error: `No package found at ${packagePath}/.` });
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

    // 3. sha: null on each path removes it from the resulting tree —
    //    this is how the Trees API deletes files. Covering every file
    //    in the package (including meta.json) here means the whole
    //    folder vanishes in this one commit.
    const treeEntries = fileEntries.map((e) => ({
      path: e.path,
      mode: "100644",
      type: "blob",
      sha: null,
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

    // 4. Commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: delete package ${cleanFolder}/${cleanPackageFolder}/ (${fileEntries.length} file${fileEntries.length === 1 ? "" : "s"})`,
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
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
