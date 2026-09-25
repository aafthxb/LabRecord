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

const foldersIndexPath = path.join(
  generatedDir,
  "folders-index.json"
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

// Discovers every program-folder under programs/<Lang>/ — any
// subdirectory other than "packages" (packages/ is language-wide and
// handled entirely separately, see below). Each program-folder must
// contain a folder.json ({ name, description }); one found without it
// is a data error, warned about and skipped rather than silently
// given an invented name. Returned in final display order: "default"
// first (pinned), then everything else alphabetical by its `name`.
function discoverProgramFolders(languageFolder) {
  const root = path.join("./programs", languageFolder);
  if (!fs.existsSync(root)) return [];

  const subdirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => name !== "packages");

  const folders = [];

  for (const slug of subdirs) {
    const folderPath = path.join(root, slug);
    const metaPath = path.join(folderPath, "folder.json");

    if (!fs.existsSync(metaPath)) {
      console.warn(`⚠ programs/${languageFolder}/${slug} has no folder.json — skipping (data error).`);
      continue;
    }

    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (e) {
      console.warn(`⚠ programs/${languageFolder}/${slug}/folder.json is invalid JSON. Skipping.`);
      continue;
    }

    if (!meta.name) {
      console.warn(`⚠ programs/${languageFolder}/${slug}/folder.json has no "name". Skipping.`);
      continue;
    }

    folders.push({
      slug,
      name: meta.name,
      description: meta.description || ""
    });
  }

  folders.sort((a, b) => {
    if (a.slug === "default") return -1;
    if (b.slug === "default") return 1;
    return a.name.localeCompare(b.name);
  });

  return folders;
}

// order.json / search-index.json / code-index.json are now keyed by
// "<LanguageFolder>/<folderSlug>" (e.g. "Java/default",
// "Java/final-set") instead of flatly by language, so each
// program-folder gets its own independent order/search/code entry.
const orderData = {};
const programCounts = {};
const searchIndex = {};
const codeIndex = {};
const foldersIndex = {};
const languageIndex = [];

// Scan each language, then each of its program-folders
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

  const programFolders = discoverProgramFolders(folder);

  if (
    fs.existsSync(path.join("./programs", folder)) &&
    !programFolders.some(pf => pf.slug === "default")
  ) {
    console.warn(`⚠ programs/${folder}/default/ doesn't exist. Run the migration (Section 7) before generating.`);
  }

  const foldersIndexEntries = [];

  for (const pf of programFolders) {
    const key = `${folder}/${pf.slug}`;
    const folderPath = path.join("./programs", folder, pf.slug);

    const existingList = Array.isArray(loadedData[key]) ? loadedData[key] : [];

    // Files currently on disk
    const diskFiles = fs
      .readdirSync(folderPath)
      .filter(file => exts.includes(path.extname(file).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    // Add new files
    for (const file of diskFiles) {
      if (!existingList.includes(file)) {
        existingList.push(file);
        console.log(`➕ Added ${key}/${file} to order.json`);
      }
    }

    // Remove deleted files
    const cleanedList = existingList.filter(file =>
      fs.existsSync(path.join(folderPath, file))
    );

    for (const file of existingList) {
      if (!fs.existsSync(path.join(folderPath, file))) {
        console.warn(`⚠ Missing file removed from order.json: ${key}/${file}`);
      }
    }

    orderData[key] = cleanedList;
    programCounts[key] = cleanedList.length;

    searchIndex[key] = [];
    codeIndex[key] = [];

    // Build search index
    for (const [index, file] of cleanedList.entries()) {

      const filePath = path.join(folderPath, file);
      const code = fs.readFileSync(filePath, "utf8");
      const search = normalizeSearchText(code);

      // Extract title and description (shared with the packages logic
      // further down — see extractTitleDescriptionGeneric()).
      const { title, description } = extractTitleDescriptionGeneric(code, language);

      if (!title) {
        console.warn(`⚠ ${key}/${file} has no title comment.`);
      }
      if (title && !description) {
        console.warn(`⚠ ${key}/${file} has no description comment.`);
      }

      const finalTitle = title || file;
      const finalDescription = description || "";

      searchIndex[key].push({
        number: index + 1,
        file,
        path: `programs/${folder}/${pf.slug}/${file}`,
        title: finalTitle,
        description: finalDescription
      });
      codeIndex[key].push({
        number: index + 1,
        file,
        path: `programs/${folder}/${pf.slug}/${file}`,
        code,
        search
      });
    }

    foldersIndexEntries.push({
      slug: pf.slug,
      name: pf.name,
      description: pf.description,
      count: cleanedList.length
    });
  }

  if (foldersIndexEntries.length > 0) {
    foldersIndex[folder] = foldersIndexEntries;
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

// Packages are deliberately excluded here — the picker page always
// renders a hardcoded Packages card and reads its count straight from
// packages-index.json, filtered by languageFolder.
writeJsonIfChanged(foldersIndexPath, foldersIndex);

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