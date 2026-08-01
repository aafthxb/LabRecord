// api/batch-save.js
//
// Applies pending reorder + delete operations for one language folder
// in a single Git commit. Unlike commit.js/delete.js (which each use
// the simple Contents API and therefore always create one commit per
// file), this uses the lower-level Git Data API — blobs, trees,
// commits, refs — so any number of deletions plus a reordered
// generated/order.json land as exactly one commit.
//
// Server-side only. Uses the same env vars as commit.js / delete.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, order: string[], deletions: string[] }
//   folder     - language folder, e.g. "C" (matches programs/<folder>/)
//   order      - full list of filenames that should remain in this
//                folder, in the new display order (deletions already
//                excluded)
//   deletions  - filenames to remove from programs/<folder>/
//
// generated/order.json is preserved rather than overwritten wholesale:
// only this folder's key is replaced, every other folder's order is
// left untouched. The next push (this commit) also re-runs the site's
// GitHub Actions generator, which reads this order.json back in and
// keeps it as-is for files that still exist.

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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, order, deletions } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid folder" });
    return;
  }

  if (!Array.isArray(order)) {
    res.status(400).json({ error: "order must be an array" });
    return;
  }

  const cleanOrder = [];
  for (const f of order) {
    const clean = sanitizeFilename(f);
    if (!clean) {
      res.status(400).json({ error: "Invalid filename in order" });
      return;
    }
    cleanOrder.push(clean);
  }

  const cleanDeletions = [];
  for (const f of Array.isArray(deletions) ? deletions : []) {
    const clean = sanitizeFilename(f);
    if (!clean) {
      res.status(400).json({ error: "Invalid filename in deletions" });
      return;
    }
    cleanDeletions.push(clean);
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
    // 1. Latest commit + tree on the branch
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

    // 2. Read the current generated/order.json so only this folder's
    //    key changes — every other folder's order is left as-is.
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

    currentOrderJson[cleanFolder] = cleanOrder;

    // 3. Build one tree with every change: each deletion becomes a
    //    tree entry with sha: null (removes the path), plus the
    //    updated order.json content.
    const treeEntries = cleanDeletions.map((filename) => ({
      path: `programs/${cleanFolder}/${filename}`,
      mode: "100644",
      type: "blob",
      sha: null,
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

    // 4. One commit for everything
    const summary = [];
    if (cleanDeletions.length) {
      summary.push(`delete ${cleanDeletions.length} file${cleanDeletions.length === 1 ? "" : "s"}`);
    }
    summary.push(`update order`);

    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: ${summary.join(", ")} in ${cleanFolder}/`,
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
      deleted: cleanDeletions,
      order: cleanOrder,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
