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
    extensions: language.extensions
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

for (const line of lines) {

  const trimmed = line.trim();

  if (!trimmed) continue;

  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  ) {

    const cleanLine = trimmed
      .replace(/^\/\/\s*/, "")
      .replace(/^\/\*\s*/, "")
      .replace(/\*\/$/, "")
      .replace(/^\*\s*/, "")
      .trim();

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

writeJsonIfChanged(orderFilePath, orderData);

// Save indexes
writeJsonIfChanged(languageIndexPath, languageIndex);
writeJsonIfChanged(searchIndexPath, searchIndex);
writeJsonIfChanged(codeIndexPath, codeIndex);

const prismLoader = `
${JSON.stringify(prismLanguages, null, 2)}.forEach(language => {
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
console.log("==================================");
console.log("Build complete.");