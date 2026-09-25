// api/create-folder.js
//
// Creates a new custom program-folder — programs/<folder>/<slug>/folder.json —
// in a single commit. This single-file commit is what keeps a brand-new,
// still-empty folder alive in git (git doesn't track empty directories).
// Mirrors commit-package.js's structure/conventions.
//
// Server-side only. Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, name, description }
//   folder      - language folder, e.g. "Java" (matches programs/<folder>/)
//   name        - the folder's display name, e.g. "Final Set" — the slug
//                 (directory name) is derived from this server-side and
//                 is permanent from here on
//   description - optional, written into folder.json

const {
  sanitizeFolder,
  loadLanguages,
  findLanguageForFolder,
  slugifyFolderName,
  isValidFolderSlug,
} = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, name, description } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }

  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  const slug = slugifyFolderName(cleanName);
  if (!isValidFolderSlug(slug)) {
    res.status(400).json({
      error: `"${cleanName}" isn't a usable folder name — choose something with at least one letter or number, and not "Default" or "Packages".`,
    });
    return;
  }

  const cleanDescription = typeof description === "string" ? description.trim() : "";

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
  const folderPath = `programs/${cleanFolder}/${slug}`;
  const metaFilePath = `${folderPath}/folder.json`;
  const apiUrl = `${apiBase}/contents/${metaFilePath}`;

  try {
    // Reject outright on any collision — including a different name
    // that slugifies the same way — rather than auto-suffixing.
    const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });

    if (existingRes.status === 200) {
      res.status(409).json({
        error: `A folder already exists at ${folderPath}/ (or a name that slugifies the same way). Choose a different name.`,
      });
      return;
    }
    if (existingRes.status !== 404) {
      throw new Error(`Unable to check for an existing folder: ${await existingRes.text()}`);
    }

    const meta = { name: cleanName, description: cleanDescription };
    const contentBase64 = Buffer.from(JSON.stringify(meta, null, 2) + "\n", "utf8").toString(
      "base64"
    );

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: create folder ${cleanFolder}/${slug}/`,
        content: contentBase64,
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
      slug,
      name: cleanName,
      description: cleanDescription,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
