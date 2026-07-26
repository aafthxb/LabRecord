let javaCount = 0;
let cCount = 0;
const fs = require("fs");
const path = require("path");

const orderFilePath = path.join("./", "order.json");
const searchIndexPath = path.join("./", "search-index.json");
const codeIndexPath = path.join("./", "code-index.json");

// Load supported languages
const languages = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "languages.json"),
    "utf8"
  )
);
// Build folders object from languages.json
const folders = {};

for (const language of Object.values(languages)) {
  folders[language.displayName] = language.extensions;
}
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

// Load existing order.json or initialize empty structure
let orderData = { Java: [], C: [] };

if (fs.existsSync(orderFilePath)) {
  try {
    const loadedData = JSON.parse(fs.readFileSync(orderFilePath, "utf8"));
    orderData = { Java: [], C: [], ...loadedData };
  } catch (e) {
    console.warn("⚠ Unable to parse order.json. Creating a new one.");
  }
}

let isUpdated = false;

// Search index
const searchIndex = {
  Java: [],
  C: []
};

const codeIndex = {
  Java: [],
  C: []
};

// Scan each folder
for (const [folder, exts] of Object.entries(folders)) {

  const folderPath = path.join("./", folder);

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
      isUpdated = true;
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

  if (cleanedList.length !== existingList.length) {
    isUpdated = true;
  }

  orderData[folder] = cleanedList;
  if (folder === "Java") {
  javaCount = cleanedList.length;
} else if (folder === "C") {
  cCount = cleanedList.length;
}

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
  path: `${folder}/${file}`,
  title,
  description
});
codeIndex[folder].push({
  number: index + 1,
  file,
  path: `${folder}/${file}`,
  code,
  search
});

  }
}

// Save indexes
writeJsonIfChanged(searchIndexPath, searchIndex);
writeJsonIfChanged(codeIndexPath, codeIndex);

// Save order.json if changed
if (isUpdated) {
  writeJsonIfChanged(orderFilePath, orderData);
} else {
  console.log("✓ order.json is already up to date.");
}

console.log("\n==================================");
console.log(" Interactive Lab Record Generator");
console.log("==================================");
console.log(`Java Programs : ${javaCount}`);
console.log(`C Programs    : ${cCount}`);
console.log(`Total Programs: ${javaCount + cCount}`);
console.log("==================================");
console.log("Build complete.");