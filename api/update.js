// api/update.js
//
// Server-side only. Updates the content of an EXISTING program file
// in place — the filename is fixed and never changes here. Powers the
// inline editor on the homepage: unlock editor mode, expand a program
// card, edit the code (including its first two title/description
// comment lines) right there, press SAVE.
//
// Deliberately separate from commit.js: commit.js only ever *creates*
// a new file and 409s if one already exists at that path; this is the
// mirror image — it only ever *updates* a file that already exists,
// and 404s if it doesn't (e.g. deleted from another tab in the
// meantime). Neither endpoint can rename a file.
//
// Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE

const { sanitizeFilename, sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, filename, code } = req.body || {};

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

  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "Code is empty" });
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

  // No languages.json / extension re-validation here — this endpoint
  // never renames a file, so whatever extension it already has was
  // already validated when it was created.
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
    // Updating through the Contents API requires the file's current
    // blob sha — this lookup doubles as the existence check (someone
    // may have deleted this file from another tab in the meantime).
    const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });

    if (existingRes.status === 404) {
      res.status(404).json({
        error: "That file doesn't exist anymore (deleted or renamed elsewhere?). Reload and try again.",
      });
      return;
    }

    if (!existingRes.ok) {
      const errText = await existingRes.text();
      res.status(502).json({ error: `GitHub lookup failed: ${errText}` });
      return;
    }

    const existingData = await existingRes.json();
    const contentBase64 = Buffer.from(code, "utf8").toString("base64");

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: update ${cleanFilename} in ${cleanFolder}/`,
        content: contentBase64,
        sha: existingData.sha,
        branch,
      }),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      res.status(502).json({ error: `GitHub commit failed: ${errText}` });
      return;
    }

    const putData = await putRes.json();

    res.status(200).json({
      ok: true,
      path: filePath,
      commitUrl: putData.commit?.html_url || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
