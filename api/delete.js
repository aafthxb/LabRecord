// api/delete.js
//
// Server-side only. Deletes a single program file from GitHub.
//
// Also handles deleting an empty custom program-folder, dispatched on
// body.kind — folded in here (rather than a separate
// api/delete-folder.js) to stay under Vercel Hobby's
// 12-serverless-functions-per-deployment cap:
//   kind omitted / "program"  -> delete a program file (original behavior)
//   kind === "folder"         -> delete an empty program-folder
//
// Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE

const { sanitizeFilename, sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.EDITOR_ACCESS_CODE || (req.body || {}).accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  if ((req.body || {}).kind === "folder") {
    return deleteFolder(req, res);
  }
  return deleteProgram(req, res);
};

async function deleteProgram(req, res) {
  const { folder, programFolder, filename } = req.body || {};

  const cleanFilename = sanitizeFilename(filename);
  if (!cleanFilename) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid folder" });
    return;
  }

  const cleanProgramFolder = sanitizeFolder(programFolder || "default");
  if (!cleanProgramFolder) {
    res.status(400).json({ error: "Invalid program folder" });
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

  const filePath = `programs/${cleanFolder}/${cleanProgramFolder}/${cleanFilename}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    // Deleting through the GitHub API requires the file's current blob sha.
    const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });

    if (existingRes.status === 404) {
      res.status(404).json({ error: "That file doesn't exist (already deleted?)." });
      return;
    }

    if (!existingRes.ok) {
      const errText = await existingRes.text();
      res.status(502).json({ error: `GitHub lookup failed: ${errText}` });
      return;
    }

    const existingData = await existingRes.json();

    const delRes = await fetch(apiUrl, {
      method: "DELETE",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${cleanFilename} via LabRecord editor`,
        sha: existingData.sha,
        branch,
      }),
    });

    if (!delRes.ok) {
      const errText = await delRes.text();
      res.status(502).json({ error: `GitHub delete failed: ${errText}` });
      return;
    }

    const delData = await delRes.json();

    res.status(200).json({
      ok: true,
      path: filePath,
      commitUrl: delData.commit?.html_url || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
}

// Deletes a custom program-folder — programs/<folder>/<slug>/ — but
// only when it's empty of programs (folder.json is the only thing
// left in it). Refuses "default" outright (never deletable) and
// refuses a non-empty folder with a clear error.
//
// Body (kind: "folder"): { accessCode, kind, folder, slug }
//   folder - language folder, e.g. "Java"
//   slug   - the custom folder's directory name, e.g. "final-set"
async function deleteFolder(req, res) {
  const { folder, slug } = req.body || {};

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  const cleanSlug = sanitizeFolder(slug);
  if (!cleanSlug) {
    res.status(400).json({ error: "Invalid folder slug" });
    return;
  }

  if (cleanSlug === "default" || cleanSlug === "packages") {
    res.status(400).json({
      error: cleanSlug === "default"
        ? "Default can't be deleted."
        : "That isn't a program folder.",
    });
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
  const folderPath = `programs/${cleanFolder}/${cleanSlug}`;

  try {
    // 1. What's actually in this folder right now — also doubles as
    //    the "does it even exist" check, and the emptiness check.
    const listRes = await fetch(
      `${apiBase}/contents/${folderPath}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders }
    );
    if (listRes.status === 404) {
      res.status(404).json({ error: `No folder found at ${folderPath}/.` });
      return;
    }
    if (!listRes.ok) {
      throw new Error(`Unable to list the folder's contents: ${await listRes.text()}`);
    }
    const entries = await listRes.json();
    const fileEntries = (Array.isArray(entries) ? entries : []).filter((e) => e.type === "file");

    if (fileEntries.length === 0) {
      res.status(404).json({ error: `No folder found at ${folderPath}/.` });
      return;
    }

    const nonMetaFiles = fileEntries.filter((e) => e.name !== "folder.json");
    if (nonMetaFiles.length > 0) {
      res.status(409).json({
        error: `Delete the ${nonMetaFiles.length} program${nonMetaFiles.length === 1 ? "" : "s"} in this folder first, then delete the folder.`,
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

    // 3. Read + update generated/order.json, search-index.json,
    //    code-index.json, folders-index.json so the site doesn't show
    //    stale references to this folder until the next full
    //    regenerate — mirrors how batch-save.js keeps order.json in
    //    sync inline rather than waiting on CI.
    async function readJsonFile(repoPath) {
      const r = await fetch(
        `${apiBase}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`,
        { headers: ghHeaders }
      );
      if (r.status === 200) {
        const data = await r.json();
        try {
          return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
        } catch {
          return {};
        }
      }
      if (r.status === 404) return {};
      throw new Error(`Unable to read ${repoPath}: ${await r.text()}`);
    }

    const orderKey = `${cleanFolder}/${cleanSlug}`;
    const [orderJson, searchIndexJson, codeIndexJson, foldersIndexJson] = await Promise.all([
      readJsonFile("generated/order.json"),
      readJsonFile("generated/search-index.json"),
      readJsonFile("generated/code-index.json"),
      readJsonFile("generated/folders-index.json"),
    ]);

    delete orderJson[orderKey];
    delete searchIndexJson[orderKey];
    delete codeIndexJson[orderKey];
    if (Array.isArray(foldersIndexJson[cleanFolder])) {
      foldersIndexJson[cleanFolder] = foldersIndexJson[cleanFolder].filter(
        (f) => f.slug !== cleanSlug
      );
    }

    // 4. sha: null on each path removes it from the resulting tree.
    //    The folder is only ever folder.json at this point (checked
    //    above), so this is the whole thing disappearing in one commit.
    const treeEntries = fileEntries.map((e) => ({
      path: e.path,
      mode: "100644",
      type: "blob",
      sha: null,
    }));

    treeEntries.push(
      {
        path: "generated/order.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(orderJson, null, 2) + "\n",
      },
      {
        path: "generated/search-index.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(searchIndexJson, null, 2) + "\n",
      },
      {
        path: "generated/code-index.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(codeIndexJson, null, 2) + "\n",
      },
      {
        path: "generated/folders-index.json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(foldersIndexJson, null, 2) + "\n",
      }
    );

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
        message: `Editor: delete folder ${cleanFolder}/${cleanSlug}/`,
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
      slug: cleanSlug,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
}
