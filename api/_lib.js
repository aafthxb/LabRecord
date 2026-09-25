// api/_lib.js
//
// Shared helpers used by every editor API endpoint (commit, update,
// delete, batch-commit, batch-save). Previously each endpoint carried
// its own copy of these functions — the same logic maintained in five
// places meant a fix to one (e.g. the language-comment-style handling)
// could silently drift out of sync with the others. Pulled into one
// place so there's exactly one copy to keep correct.

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

// Reserved program-folder slugs — a custom folder can never collide
// with these, since "default" and "packages" already mean something
// specific on disk (programs/<Lang>/default/, programs/<Lang>/packages/).
const RESERVED_FOLDER_SLUGS = new Set(["default", "packages"]);

// Turns a user-supplied display name into a URL/path-safe slug:
// lowercase, spaces/punctuation collapsed to single hyphens, leading/
// trailing hyphens trimmed. Mirrors the rule described in the custom
// folders spec ("lowercase, spaces/punctuation -> hyphens, collapse/
// trim").
function slugifyFolderName(name) {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A program-folder slug is just a directory name — same rules as
// sanitizeFolder (no slashes, no traversal) plus the reserved-word
// check, used by create/update/delete-folder.
function isValidFolderSlug(slug) {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= 100 &&
    !/[\/\\]/.test(slug) &&
    !slug.includes("..") &&
    !RESERVED_FOLDER_SLUGS.has(slug)
  );
}

function loadLanguages() {
  // languages.json lives in scripts/ (it's a build-time config file, not
  // a published asset) — these two candidates are just two ways a Vercel
  // serverless function's working directory can resolve that same path,
  // not a fallback for a different location.
  const candidates = [
    path.join(process.cwd(), "scripts", "languages.json"),
    path.join(__dirname, "..", "scripts", "languages.json"),
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

  throw new Error("scripts/languages.json not found");
}

// Looks up a language's config by folder name via its aliases (matching
// the same case-insensitive rule the client and generator both use).
function findLanguageForFolder(languages, folder) {
  const normalizedFolder = folder.toLowerCase();
  return Object.values(languages).find(
    (l) => Array.isArray(l.aliases) && l.aliases.includes(normalizedFolder)
  ) || null;
}

module.exports = {
  sanitizeFilename,
  sanitizeFolder,
  loadLanguages,
  findLanguageForFolder,
  slugifyFolderName,
  isValidFolderSlug,
  RESERVED_FOLDER_SLUGS,
};
