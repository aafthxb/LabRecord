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

// Attachments are optional companion data files a program reads at run
// time (e.g. "students.txt" for a file-handling exercise). They're
// stored as a `<filename>.attach.json` blob inside an `attachments/`
// subfolder of the program's language folder (e.g.
// programs/Java/attachments/Foo.java.attach.json) — never executable,
// never part of languages.json's extension whitelist — so validation
// here is deliberately generic (same filename rules as
// sanitizeFilename) rather than reusing the per-language extension
// check.
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 200 * 1024; // 200 KB — generous for lab input files

function sanitizeAttachments(attachments) {
  if (attachments === undefined || attachments === null) return [];
  if (!Array.isArray(attachments)) {
    throw new Error("attachments must be an array");
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments (max ${MAX_ATTACHMENTS})`);
  }

  const clean = [];
  const seen = new Set();

  for (const a of attachments) {
    const name = sanitizeFilename(a && a.name);
    if (!name) {
      throw new Error(`Invalid attachment filename: ${(a && a.name) || ""}`);
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate attachment filename: ${name}`);
    }
    seen.add(key);

    if (typeof (a && a.content) !== "string" || !a.content.trim()) {
      throw new Error(`Attachment "${name}" has no content`);
    }
    if (Buffer.byteLength(a.content, "utf8") > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment "${name}" is too large (max ${Math.floor(MAX_ATTACHMENT_BYTES / 1024)} KB)`);
    }

    clean.push({ name, content: a.content });
  }

  return clean;
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
  sanitizeAttachments,
};
