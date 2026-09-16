const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");
const generatedDir = path.join("./", "generated");

const languageIndexPath = path.join(
  generatedDir,
  "language-index.json"
);

const orderFilePath = path.join(
  generatedDir,
  "order.json"
);

const searchIndexPath = path.join(
  generatedDir,
  "search-index.json"
);

const codeIndexPath = path.join(
  generatedDir,
  "code-index.json"
);

const prismLoaderPath = path.join(
  generatedDir,
  "prism-loader.js"
);

const siteInfoPath = path.join(
  generatedDir,
  "site-info.json"
);

const packagesIndexPath = path.join(
  generatedDir,
  "packages-index.json"
);

const packagesCodeDir = path.join(
  generatedDir,
  "packages-code"
);

// Load supported languages
const languages = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "languages.json"),
    "utf8"
  )
);

function getLanguageConfig(folderName) {
  const normalized = folderName.toLowerCase();

  for (const [id, language] of Object.entries(languages)) {
    if (language.aliases.includes(normalized)) {
      return {
        id,
        folder: folderName,
        ...language
      };
    }
  }

  return null;
}
function discoverLanguages() {
  const root = "./programs";

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => getLanguageConfig(entry.name))
    .filter(Boolean);
}
const discoveredLanguages = discoverLanguages();

fs.mkdirSync(generatedDir, {
  recursive: true
});

const prismLanguages = [
  ...new Set(
    discoveredLanguages.map(
      language => language.prism
    )
  )
];

function normalizeSearchText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")   // Remove punctuation
    .replace(/\s+/g, " ")       // Collapse whitespace
    .trim();
}

function writeJsonIfChanged(filePath, data) {
  const newContent = JSON.stringify(data, null, 2);

  if (fs.existsSync(filePath)) {
    const currentContent = fs.readFileSync(filePath, "utf8");

    if (currentContent === newContent) {
      console.log(`✓ ${path.basename(filePath)} is already up to date.`);
      return false;
    }
  }

  fs.writeFileSync(filePath, newContent);
  console.log(`✓ ${path.basename(filePath)} updated.`);
  return true;
}

function writeTextIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, "utf8");

    if (current === content) {
      console.log(`✓ ${path.basename(filePath)} is already up to date.`);
      return;
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`✓ ${path.basename(filePath)} updated.`);
}

function getGitHubInfo() {
  try {
    const remote = execSync(
      "git config --get remote.origin.url",
      { encoding: "utf8" }
    ).trim();

    let match =
      remote.match(
        /^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/
      ) ||
      remote.match(
        /^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/
      );

    if (!match) {
      throw new Error("Unsupported Git remote.");
    }

    return {
      username: match[1],
      repository: match[2],
      url: `https://github.com/${match[1]}`
    };

  } catch {

    return {
      username: "Aafthab",
      repository: "",
      url: "https://github.com/aafthxb"
    };

  }
}

// Load existing order.json while preserving custom order
let loadedData = {};

if (fs.existsSync(orderFilePath)) {
  try {
    loadedData = JSON.parse(
      fs.readFileSync(orderFilePath, "utf8")
    );
  } catch (e) {
    console.warn("⚠ Unable to parse order.json. Creating a new one.");
  }
}

// Initialize order data using only currently discovered languages
const orderData = {};

for (const language of discoveredLanguages) {
  orderData[language.folder] = Array.isArray(
    loadedData[language.folder]
  )
    ? loadedData[language.folder]
    : [];
}

const programCounts = {};

// Search index
const searchIndex = {};

for (const language of discoveredLanguages) {
  searchIndex[language.folder] = [];
}

const codeIndex = {};

for (const language of discoveredLanguages) {
  codeIndex[language.folder] = [];
}

const languageIndex = [];

// Scan each folder
for (const language of discoveredLanguages) {

  const folder = language.folder;
  const exts = language.extensions;

  languageIndex.push({
    id: language.id,
    displayName: language.displayName,
    folder: language.folder,
    compiler: language.compiler,
    prism: language.prism,
    description: language.description,
    searchPlaceholder: language.searchPlaceholder,
    aliases: language.aliases,
    extensions: language.extensions,
    comments: language.comments
});

  const folderPath = path.join("./programs", folder);

  if (!fs.existsSync(folderPath)) continue;

  const existingList = Array.isArray(orderData[folder])
    ? orderData[folder]
    : [];

  // Files currently on disk
  const diskFiles = fs
    .readdirSync(folderPath)
    .filter(file => exts.includes(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  // Add new files
  for (const file of diskFiles) {
    if (!existingList.includes(file)) {
      existingList.push(file);
console.log(`➕ Added ${folder}/${file} to order.json`);
    }
  }

  // Remove deleted files
  const cleanedList = existingList.filter(file =>
    fs.existsSync(path.join(folderPath, file))
  );

  for (const file of existingList) {
  if (!fs.existsSync(path.join(folderPath, file))) {
    console.warn(`⚠ Missing file removed from order.json: ${folder}/${file}`);
  }
}

  orderData[folder] = cleanedList;
  programCounts[folder] = cleanedList.length;

  // Build search index
  for (const [index, file] of cleanedList.entries()) {

    const filePath = path.join(folderPath, file);
    const code = fs.readFileSync(filePath, "utf8");
    const search = normalizeSearchText(code);

    // Extract title and description
const lines = code.split(/\r?\n/);
const commentLines = [];

// Which prefixes count as a leading comment for this language — e.g.
// "//" and "/* */" for C-family languages, "#" for Python. Falls back
// to the C-style default if a language predates this field in
// languages.json, so existing configs don't need updating.
const lineMarkers = (language.comments && language.comments.line) || ["//"];
const blockMarkers = (language.comments && language.comments.block) || ["/*", "*/"];
const [blockOpen, blockClose] = blockMarkers;

for (const line of lines) {

  const trimmed = line.trim();

  if (!trimmed) continue;

  const isLineComment = lineMarkers.some(marker => trimmed.startsWith(marker));
  const isBlockComment =
    blockOpen && (trimmed.startsWith(blockOpen) || trimmed.startsWith("*"));

  if (isLineComment || isBlockComment) {

    let cleanLine = trimmed;

    for (const marker of lineMarkers) {
      if (cleanLine.startsWith(marker)) {
        cleanLine = cleanLine.slice(marker.length).trim();
        break;
      }
    }

    if (blockOpen && cleanLine.startsWith(blockOpen)) {
      cleanLine = cleanLine.slice(blockOpen.length).trim();
    }
    if (blockClose && cleanLine.endsWith(blockClose)) {
      cleanLine = cleanLine.slice(0, -blockClose.length).trim();
    }
    if (blockOpen && cleanLine.startsWith("*")) {
      cleanLine = cleanLine.slice(1).trim();
    }

    if (cleanLine.length > 0) {
      commentLines.push(cleanLine);
    }

    if (commentLines.length === 2) break;

  } else {

    break;

  }
}

if (commentLines.length === 0) {
  console.warn(`⚠ ${folder}/${file} has no title comment.`);
}

if (commentLines.length === 1) {
  console.warn(`⚠ ${folder}/${file} has no description comment.`);
}

const title = commentLines[0] || file;
const description = commentLines[1] || "";

    searchIndex[folder].push({
  number: index + 1,
  file,
  path: `programs/${folder}/${file}`,
  title,
  description
});
codeIndex[folder].push({
  number: index + 1,
  file,
  path: `programs/${folder}/${file}`,
  code,
  search
});

  }
}

// ==========================
// Custom packages (multi-file programs)
// ==========================
//
// A "package" is a folder under ./programs/<LanguageFolder>/packages/<PackageFolder>/
// containing a meta.json ({ name, description }) plus its source files.
// Nesting packages inside each language's own programs/ folder means
// only that language's packages ever show up on its page, and the
// repo's folder structure reads the same way for both programs and
// packages — programs/Java/SumOfTwoNumbers.java sits right next to
// programs/Java/packages/GreeterDemo/. A package's language is just
// whichever folder it lives under — meta.json can still set an explicit
// "language" to override that (e.g. a package that doesn't match its
// folder for some reason), but it's optional now.
//
// Unlike programs/, packages are not reordered or edited in-browser —
// this generator is the only thing that produces their index, so a
// package's list order is just alphabetical-by-folder, same as
// everything else discovered from disk.
//
// Two outputs:
//  - generated/packages-index.json: everything each language's
//    packages-list view and each package's file-cards page need (name,
//    description, file metadata, and a rolled-up `searchText` for the
//    list page's fast/metadata-only search — see chat notes: the
//    top-level list intentionally never touches code content). Every
//    entry also carries `languageFolder` so the client can filter down
//    to just the packages that belong on the currently open language's
//    page.
//  - generated/packages-code/<LanguageFolder>/<PackageFolder>.json: one
//    file PER package with that package's file contents, fetched lazily
//    only once someone opens that specific package and its fast-tier
//    search comes up empty (mirrors the existing single-folder
//    code-index fallback, just scoped per package instead of one global
//    file). Namespaced by language folder too, since two different
//    languages could otherwise have a same-named package folder.

function extractTitleDescriptionGeneric(code, language) {
  const lines = code.split(/\r?\n/);
  const commentLines = [];

  const lineMarkers = (language?.comments && language.comments.line) || ["//"];
  const blockMarkers = (language?.comments && language.comments.block) || ["/*", "*/"];
  const [blockOpen, blockClose] = blockMarkers;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isLineComment = lineMarkers.some(marker => trimmed.startsWith(marker));
    const isBlockComment =
      blockOpen && (trimmed.startsWith(blockOpen) || trimmed.startsWith("*"));

    if (isLineComment || isBlockComment) {
      let cleanLine = trimmed;

      for (const marker of lineMarkers) {
        if (cleanLine.startsWith(marker)) {
          cleanLine = cleanLine.slice(marker.length).trim();
          break;
        }
      }

      if (blockOpen && cleanLine.startsWith(blockOpen)) {
        cleanLine = cleanLine.slice(blockOpen.length).trim();
      }
      if (blockClose && cleanLine.endsWith(blockClose)) {
        cleanLine = cleanLine.slice(0, -blockClose.length).trim();
      }
      if (blockOpen && cleanLine.startsWith("*")) {
        cleanLine = cleanLine.slice(1).trim();
      }

      if (cleanLine.length > 0) commentLines.push(cleanLine);
      if (commentLines.length === 2) break;
    } else {
      break;
    }
  }

  return {
    title: commentLines[0] || null,
    description: commentLines[1] || ""
  };
}

// Scans ./programs/<languageFolder>/packages/ (one call per known
// language folder — the same folders discovered under ./programs) for
// subfolders containing a meta.json. Packages nest inside their
// language's own programs/ folder — mirroring how programs/<folder>/
// itself works — rather than living in a separate top-level packages/
// tree, so the repo's folder structure reads the same way for both. A
// language with no programs/<languageFolder>/packages/ directory at
// all simply has no packages yet, same as a language with zero
// programs.
function discoverPackagesForLanguage(languageFolder) {
  const root = path.join("./programs", languageFolder, "packages");
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(folder => fs.existsSync(path.join(root, folder, "meta.json")))
    .sort((a, b) => a.localeCompare(b));
}

const packagesIndex = [];
let totalPackageFiles = 0;
let totalPackages = 0;

fs.mkdirSync(packagesCodeDir, { recursive: true });

// Clean out per-language packages-code directories/files that no
// longer correspond to a real package, so a renamed/removed package
// (or an entire language's packages/ folder going away) doesn't leave
// stale, unreferenced code-fallback files behind.
const validCodeFiles = new Set(); // "LanguageFolder/PackageFolder.json"

for (const language of discoveredLanguages) {
  const folder = language.folder;
  const packageFolders = discoverPackagesForLanguage(folder);

  if (packageFolders.length === 0) continue;

  const langCodeDir = path.join(packagesCodeDir, folder);
  fs.mkdirSync(langCodeDir, { recursive: true });

  for (const pkgFolder of packageFolders) {
    const pkgPath = path.join("./programs", folder, "packages", pkgFolder);
    const metaPath = path.join(pkgPath, "meta.json");

    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (e) {
      console.warn(`⚠ programs/${folder}/packages/${pkgFolder}/meta.json is invalid JSON. Skipping package.`);
      continue;
    }

    // meta.json can still override the language explicitly; otherwise
    // it's simply whichever language folder this package lives under.
    const languageId = (meta.language || language.id || "").toLowerCase();
    const pkgLanguage = languages[languageId] || language;

    const files = fs
      .readdirSync(pkgPath)
      .filter(file => pkgLanguage.extensions.includes(path.extname(file).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.warn(`⚠ programs/${folder}/packages/${pkgFolder} has no ${languageId || folder} source files. Skipping package.`);
      continue;
    }

    const fileEntries = [];
    const codeEntries = [];
    const rollup = [meta.name || pkgFolder, meta.description || ""];

    files.forEach((file, index) => {
      const filePath = path.join(pkgPath, file);
      const code = fs.readFileSync(filePath, "utf8");
      const search = normalizeSearchText(code);
      const { title, description } = extractTitleDescriptionGeneric(code, pkgLanguage);

      const finalTitle = title || file;
      const finalDescription = description || "";

      fileEntries.push({
        number: index + 1,
        file,
        path: `programs/${folder}/packages/${pkgFolder}/${file}`,
        title: finalTitle,
        description: finalDescription
      });

      codeEntries.push({
        number: index + 1,
        file,
        path: `programs/${folder}/packages/${pkgFolder}/${file}`,
        code,
        search
      });

      rollup.push(finalTitle, file, finalDescription);
    });

    packagesIndex.push({
      folder: pkgFolder,
      languageFolder: folder,
      name: meta.name || pkgFolder,
      description: meta.description || "",
      language: languageId,
      compiler: pkgLanguage.compiler,
      prism: pkgLanguage.prism,
      fileCount: fileEntries.length,
      // Rolled-up metadata search string: the package's own name/
      // description PLUS every file's title/description/filename, so a
      // search for something that only appears inside one file (e.g. a
      // class named "Greeter") still surfaces the package on its
      // language's packages list — see chat notes on this exact case.
      searchText: normalizeSearchText(rollup.join(" ")),
      files: fileEntries
    });

    writeJsonIfChanged(
      path.join(langCodeDir, `${pkgFolder}.json`),
      codeEntries
    );

    validCodeFiles.add(`${folder}/${pkgFolder}.json`);
    totalPackageFiles += fileEntries.length;
    totalPackages += 1;
  }
}

if (fs.existsSync(packagesCodeDir)) {
  for (const langDir of fs.readdirSync(packagesCodeDir, { withFileTypes: true })) {
    if (!langDir.isDirectory()) {
      // Leftover from the old flat packages/<Package>/ layout
      // (generated/packages-code/<Package>.json directly, with no
      // language subfolder) — no longer valid under the per-language
      // scheme, safe to remove.
      fs.unlinkSync(path.join(packagesCodeDir, langDir.name));
      console.log(`✓ Removed stale packages-code/${langDir.name} (pre-language-folder layout)`);
      continue;
    }

    const langDirPath = path.join(packagesCodeDir, langDir.name);

    for (const existing of fs.readdirSync(langDirPath)) {
      const key = `${langDir.name}/${existing}`;
      if (!validCodeFiles.has(key)) {
        fs.unlinkSync(path.join(langDirPath, existing));
        console.log(`✓ Removed stale packages-code/${key}`);
      }
    }

    if (fs.readdirSync(langDirPath).length === 0) {
      fs.rmdirSync(langDirPath);
    }
  }
}

writeJsonIfChanged(packagesIndexPath, packagesIndex);

writeJsonIfChanged(orderFilePath, orderData);

// Save indexes
writeJsonIfChanged(languageIndexPath, languageIndex);
writeJsonIfChanged(searchIndexPath, searchIndex);
writeJsonIfChanged(codeIndexPath, codeIndex);

// Packages can use a language that isn't otherwise present under
// programs/ (e.g. a repo with only C programs but one Java package) —
// make sure its Prism component still gets loaded.
const allPrismLanguages = [
  ...new Set([
    ...prismLanguages,
    ...packagesIndex.map(pkg => pkg.prism)
  ])
];

const prismLoader = `
${JSON.stringify(allPrismLanguages, null, 2)}.forEach(language => {
  const script = document.createElement("script");

  script.src =
    \`https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-\${language}.min.js\`;

  script.defer = true;

  document.head.appendChild(script);
});
`;

writeTextIfChanged(
  prismLoaderPath,
  prismLoader
);

writeJsonIfChanged(
  siteInfoPath,
  {
    github: getGitHubInfo()
  }
);

console.log("\n==================================");
console.log(" Interactive Lab Record Generator");
console.log("==================================");

let totalPrograms = 0;

for (const [folder, count] of Object.entries(programCounts)) {
  console.log(`${folder} Programs : ${count}`);
  totalPrograms += count;
}

console.log(`Total Programs: ${totalPrograms}`);
console.log(`Packages: ${totalPackages} (${totalPackageFiles} files)`);
console.log("==================================");
console.log("Build complete.");