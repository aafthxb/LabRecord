// api/commit.js
//
// Server-side only. The GitHub token never reaches the browser.
// Required Vercel env vars:
//   GITHUB_TOKEN          - fine-grained PAT with "Contents: Read and write" on this repo
//   GITHUB_OWNER          - e.g. "aafthxb"
//   GITHUB_REPO           - e.g. "LabRecord"
//   GITHUB_BRANCH         - optional, defaults to "main"
//   EDITOR_ACCESS_CODE    - a passphrase you choose; required to use the editor at all

const fs = require("fs");
const path = require("path");

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

function loadLanguages() {
  const candidates = [
    path.join(process.cwd(), "scripts", "languages.json"),
    path.join(__dirname, "..", "scripts", "languages.json"),
    path.join(process.cwd(), "languages.json"), // fallback if ever moved to root
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error("languages.json not found in scripts/ or repo root");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, filename, code, commitMessage } = req.body || {};

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

  let languages;
  try {
    languages = loadLanguages();
  } catch (e) {
    res.status(500).json({ error: "Unable to load languages.json on the server" });
    return;
  }

  const normalizedFolder = cleanFolder.toLowerCase();
  const langEntry = Object.values(languages).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalizedFolder)
  );

  if (!langEntry) {
    res.status(400).json({ error: "Unknown language folder" });
    return;
  }

  const ext = path.extname(cleanFilename).toLowerCase();
  if (!langEntry.extensions.includes(ext)) {
    res.status(400).json({
      error: `Filename must end with one of: ${langEntry.extensions.join(", ")}`,
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
    // Authoritative existence check (catches races the client-side check can miss)
    const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders,
    });

    if (existingRes.status === 200) {
      res.status(409).json({
        error: "A file with this name already exists in this folder. Choose a different filename.",
      });
      return;
    }

    if (existingRes.status !== 404) {
      const errText = await existingRes.text();
      res.status(502).json({ error: `GitHub check failed: ${errText}` });
      return;
    }

    const contentBase64 = Buffer.from(code, "utf8").toString("base64");

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage || `Add ${cleanFilename} via LabRecord editor`,
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
      path: filePath,
      commitUrl: putData.commit?.html_url || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error" });
  }
};
