// api/delete.js
//
// Server-side only. Deletes a single program file from GitHub.
// Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE

const { sanitizeFilename, sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, filename } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

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

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    res.status(500).json({ error: "Server is missing GitHub configuration" });
    return;
  }

  const filePath = `programs/${cleanFolder}/${cleanFilename}`;
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
};