// api/delete-package-file.js
//
// Deletes one file from an existing package via the Contents API's
// single-file delete (same approach as delete.js, just pointed at
// programs/<folder>/packages/<package>/<filename> instead of
// programs/<folder>/<filename>). Refuses to delete a package's last
// remaining source file — a package with zero files isn't a package
// generate-index.js will pick up, so that'd leave an orphaned,
// invisible programs/<folder>/packages/<package>/meta.json behind; deleting the
// whole package is the right move at that point, not this endpoint.
//
// Server-side only. Uses the same env vars as commit.js:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, EDITOR_ACCESS_CODE
//
// Body: { accessCode, folder, package, filename }

const { sanitizeFilename, sanitizeFolder } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode, folder, package: packageFolder, filename } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const cleanFolder = sanitizeFolder(folder);
  const cleanPackageFolder = sanitizeFilename(packageFolder);
  const cleanFilename = sanitizeFilename(filename);

  if (!cleanFolder) {
    res.status(400).json({ error: "Invalid language folder" });
    return;
  }
  if (!cleanPackageFolder || !/^[A-Za-z0-9_-]+$/.test(cleanPackageFolder)) {
    res.status(400).json({ error: "Invalid package folder" });
    return;
  }
  if (!cleanFilename) {
    res.status(400).json({ error: "Invalid filename" });
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
    const target = fileEntries.find((e) => e.name === cleanFilename);

    if (!target) {
      res.status(404).json({ error: `"${cleanFilename}" isn't in this package (already deleted?).` });
      return;
    }

    const sourceFileCount = fileEntries.filter((e) => e.name.toLowerCase() !== "meta.json").length;
    if (sourceFileCount <= 1) {
      res.status(400).json({
        error: "A package needs at least one file — delete the whole package instead if you want it gone.",
      });
      return;
    }

    const filePath = `${packagePath}/${cleanFilename}`;
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");

    const delRes = await fetch(`${apiBase}/contents/${encodedPath}`, {
      method: "DELETE",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Editor: delete ${filePath}`,
        sha: target.sha,
        branch,
      }),
    });

    if (!delRes.ok) {
      throw new Error(`GitHub delete failed: ${await delRes.text()}`);
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
