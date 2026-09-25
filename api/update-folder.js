// api/update-folder.js
//
// Renames a program-folder — Default included — by rewriting the
// `name` (and optional `description`) field in its existing
// folder.json. Never touches the slug/directory name, which is
// permanent from creation (see create-folder.js). Mirrors update.js's
// "update this exact path in place" shape.
//
// Server-side only. Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, slug, name, description }
//   folder - language folder, e.g. "Java"
//   slug   - the folder's existing, permanent directory name, e.g.
//            "default" or "final-set"
//   name   - the new display name
//   description - optional new description (omit to leave unchanged)

const { sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, slug, name, description } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  // Note: unlike create-folder, "default" IS allowed here — renaming
  // Default is explicitly supported, it just edits the same folder.json
  // any other folder would.
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
};
