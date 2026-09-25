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
// Also handles renaming a program-folder, dispatched on body.kind —
// folded in here (rather than a separate api/update-folder.js) to
// stay under Vercel Hobby's 12-serverless-functions-per-deployment cap:
//   kind omitted / "program"  -> update a program file's code (original behavior)
//   kind === "folder"         -> rename a program-folder (folder.json only)
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
    return renameFolder(req, res);
  }
  return updateProgram(req, res);
};

async function updateProgram(req, res) {
  const { folder, programFolder, filename, code } = req.body || {};

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
        message: `Editor: update ${cleanFilename} in ${cleanFolder}/${cleanProgramFolder}/`,
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
}

// Renames a program-folder (Default included) in place — its slug
// never changes, only the display name/description in folder.json.
//
// Body (kind: "folder"): { accessCode, kind, folder, slug, name, description }
//   folder - language folder, e.g. "Java"
//   slug   - the folder's existing, permanent directory name, e.g.
//            "default" or "final-set"
//   name   - the new display name
//   description - optional new description (omit to leave unchanged)
async function renameFolder(req, res) {
  const { folder, slug, name, description } = req.body || {};

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  // Note: unlike creation, "default" IS allowed here — renaming
  // Default is explicitly supported, it just edits the same
  // folder.json any other folder would.
  const cleanSlug = sanitizeFolder(slug);
  if (!cleanSlug) {
    res.status(400).json({ error: "Invalid folder slug" });
    return;
  }

  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) {
    res.status(400).json({ error: "Folder name is required" });
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
  const metaFilePath = `programs/${cleanFolder}/${cleanSlug}/folder.json`;
  const apiUrl = `${apiBase}/contents/${metaFilePath}`;

  try {
    const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });

    if (existingRes.status === 404) {
      res.status(404).json({ error: `No folder found at programs/${cleanFolder}/${cleanSlug}/.` });
      return;
    }
    if (!existingRes.ok) {
      throw new Error(`Unable to read folder.json: ${await existingRes.text()}`);
    }

    const existingData = await existingRes.json();

    let currentMeta = {};
    try {
      currentMeta = JSON.parse(Buffer.from(existingData.content, "base64").toString("utf8"));
    } catch {
      currentMeta = {};
    }

    const newMeta = {
      name: cleanName,
      description:
        typeof description === "string" ? description.trim() : currentMeta.description || "",
    };

    const contentBase64 = Buffer.from(JSON.stringify(newMeta, null, 2) + "\n", "utf8").toString(
      "base64"
    );

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: rename ${cleanFolder}/${cleanSlug}/ to "${cleanName}"`,
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
      commitUrl: putData.commit?.html_url || null,
      folder: cleanFolder,
      slug: cleanSlug,
      name: newMeta.name,
      description: newMeta.description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
}
