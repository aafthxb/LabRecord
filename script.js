function cleanTurboC(codeText) {
  return codeText
    .replace(/#include\s*<conio\.h>/g, '')
    .replace(/getch\(\);?/g, '')
    .replace(/clrscr\(\);?/g, '')
    .replace(/void main\(\)/g, 'int main()');
}

function copyToClipboard(text, fallbackElement) {
  const contentToCopy = text || (fallbackElement ? fallbackElement.textContent : '');

  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(contentToCopy);
  }

  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = contentToCopy;

    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    textArea.style.fontSize = '12pt';

    document.body.appendChild(textArea);

    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.select();
    }

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) resolve();
      else reject('execCommand failed');
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
}

function runWithTactileDelay(event, callback, targetOverride = null) {
  const targetEl = targetOverride || (event ? (event.currentTarget || event.target) : null);

  if (targetEl) {
    targetEl.classList.add('is-pressed');
    setTimeout(() => {
      targetEl.classList.remove('is-pressed');
      callback();
    }, 120);
    return;
  }

  callback();
}

function applyTheme(theme) {

    document.documentElement.setAttribute("data-theme", theme);

    const themeBtn = document.getElementById("theme-btn");

    if (themeBtn) {
        themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    }

    const themeColor = document.querySelector(
        'meta[name="theme-color"]'
    );

    if (themeColor) {
        themeColor.setAttribute(
            "content",
            theme === "dark"
                ? "#161616"
                : "#F4EBCF"
        );
    }

}
function toggleTheme(event) {

    runWithTactileDelay(event, () => {

        const current =
            document.documentElement.getAttribute("data-theme") || "light";

        const next =
            current === "dark" ? "light" : "dark";

        applyTheme(next);

        localStorage.setItem("theme", next);

    });

}

function openFolder(folder, event) {
    runWithTactileDelay(event, () => {

        document.getElementById("home-view").style.display = "none";
        document.getElementById("back-btn").style.display = "inline-block";
        document.getElementById("theme-btn").style.display = "none";

        // Hide all language containers
        document.querySelectorAll(".view-container").forEach(container => {
            container.classList.remove("active");
        });

        const activeContainer = document.getElementById(`${folder}-container`);

        if (!activeContainer) return;

        activeContainer.classList.add("active");
        activeContainer.classList.add("view-enter");

        activeContainer.addEventListener(
            "animationend",
            () => activeContainer.classList.remove("view-enter"),
            { once: true }
        );

        const language = App.languageIndex.find(l => l.folder === folder);

        if (language) {
            document.getElementById("page-title").textContent =
                `${language.displayName.toUpperCase()} PROGRAMS`;

            document.getElementById("page-subtitle").textContent =
                language.description || "";
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
}

function showHome(event) {
  runWithTactileDelay(event, () => {
    const home = document.getElementById("home-view");

home.style.display = "grid";
home.classList.add("view-enter");

home.addEventListener("animationend", () => {
    home.classList.remove("view-enter");
}, { once: true });
    document.querySelectorAll(".search-input").forEach(input => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
});
    document.getElementById('back-btn').style.display = 'none';
    document.getElementById("theme-btn").style.display = "flex";
    
    document.querySelectorAll(".view-container").forEach(container => {
    container.classList.remove("active");
    });

    document.getElementById("page-title").textContent =
    "LABRECORD";

document.getElementById("page-subtitle").innerHTML =
    "Interactive Programming Lab Record<br>Browse, view, and run programs by language.";

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ==========================
// Application State
// ==========================

const App = {
    currentFolder: null,
    languageIndex: [],

    metadata: {},
    cards: {},

    codeIndex: null,
    codeIndexLoaded: false,
    codeLookup: {},

    loadedPrograms: new Map()
};
// ==========================
// Load Metadata
// ==========================

async function loadSearchIndex() {

    const response = await fetch("/generated/search-index.json");
    if (!response.ok) {
        throw new Error("Unable to load search index.");
    }

    App.metadata = await response.json();
}

async function loadLanguageIndex() {

    const response = await fetch("/generated/language-index.json");

    if (!response.ok) {
        throw new Error("Unable to load language index.");
    }

    App.languageIndex = await response.json();
}

async function loadSiteInfo() {

    const response =
        await fetch("/generated/site-info.json");

    if (!response.ok) return null;

    return response.json();

}

function buildLanguageUI() {
    const homeView = document.getElementById("home-view");
    const languageViews = document.getElementById("language-views");

    homeView.innerHTML = "";
    languageViews.innerHTML = "";

    App.languageIndex.forEach(language => {

        // ---------- Home Card ----------
        const card = document.createElement("div");
        card.className = "folder-card";

        card.onclick = (event) => openFolder(language.folder, event);

        card.innerHTML = `
            <h2 class="folder-card-title">
                ${language.displayName.toUpperCase()} PROGRAMS
            </h2>
            <p class="folder-card-desc">
                ${language.description || ""}
            </p>
        `;

        homeView.appendChild(card);

        // ---------- Container ----------
        const container = document.createElement("div");

        container.id = `${language.folder}-container`;
        container.className = "view-container";

        languageViews.appendChild(container);
    });
}

// ==========================
// Load Code Search Index
// ==========================

async function loadCodeIndex() {

    if (App.codeIndexLoaded) return;

    const response = await fetch("/generated/code-index.json");

    if (!response.ok) {
        throw new Error("Unable to load code index.");
    }

    App.codeIndex = await response.json();

App.codeLookup = {};

App.languageIndex.forEach(language => {

    const folder = language.folder;

    (App.codeIndex[folder] || []).forEach(program => {

        App.codeLookup[program.path] = program;

    });

});

    App.codeIndexLoaded = true;
}

function getPrograms(folder) {
    return App.metadata[folder] || [];
}

function createSearchUI(container, folder) {

    const searchContainer = document.createElement("div");
    searchContainer.className = "search-container";

    const wrapper = document.createElement("div");
    wrapper.className = "search-wrapper";

    const input = document.createElement("input");
input.className = "search-input";
input.type = "text";

const language = App.languageIndex.find(
    l => l.folder === folder
);

input.placeholder =
    language?.searchPlaceholder ||
    `Search ${language?.displayName ?? folder} programs...`;

    const clearBtn = document.createElement("button");
    clearBtn.className = "search-clear";
    clearBtn.innerHTML = "&times;";
    clearBtn.style.display = "none";

    const status = document.createElement("div");
    status.className = "search-status";

    const noResults = document.createElement("p");
    noResults.className = "no-results";
    noResults.textContent = "No matching programs found.";
    noResults.style.display = "none";

    const mobileNote = document.createElement("p");
mobileNote.className = "mobile-run-note";
mobileNote.textContent = "ⓘ Run Program is available only on desktop.";

    wrapper.appendChild(input);
wrapper.appendChild(clearBtn);

searchContainer.appendChild(wrapper);
searchContainer.appendChild(status);
searchContainer.appendChild(mobileNote);

container.appendChild(searchContainer);
container.appendChild(noResults);

    return {
        input,
        clearBtn,
        status,
        noResults
    };
}
function highlightText(text, keywords) {

    if (!keywords.length)
        return text;

    let highlighted = text;

    keywords.forEach(word => {

        if (!word) return;

        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        highlighted = highlighted.replace(
            new RegExp(`(${escaped})`, "gi"),
            "<mark>$1</mark>"
        );

    });

    return highlighted;
}
function setupSearch(search, folder) {

    const { input, clearBtn, status, noResults } = search;

    async function filterCards() {

        const query = input.value.trim().toLowerCase();
        const keywords = query.split(/\s+/).filter(Boolean);

        clearBtn.style.display = query ? "block" : "none";

        let visible = 0;
        let metadataMatches = 0;
        const matchedCards = [];

        App.cards[folder].forEach(card => {

            let match = false;

            if (!query) {
                match = true;
            } else if (/^\d+$/.test(query)) {
                match = card.dataset.number === query;
            } else {
                match = keywords.every(word =>
                    card.dataset.search.includes(word)
                );
            }

            card.style.display = match ? "" : "none";

            const titleText = card.querySelector(".program-title-text");
            const fileBadge = card.querySelector(".file-badge");
            const subtitle = card.querySelector(".card-subtitle");
            const codeBadge = card.querySelector(".code-match-badge");

            if (!query) {

                titleText.textContent = card.originalContent.title;
                fileBadge.textContent = card.originalContent.file;
                subtitle.textContent = card.originalContent.description;

                codeBadge.style.display = "none";
                card.dataset.codeMatch = "false";

            } else {

                titleText.innerHTML =
                    highlightText(card.originalContent.title, keywords);

                fileBadge.innerHTML =
                    highlightText(card.originalContent.file, keywords);

                subtitle.innerHTML =
                    highlightText(card.originalContent.description, keywords);

                codeBadge.style.display =
                    card.dataset.codeMatch === "true"
                        ? "inline-block"
                        : "none";
            }

            if (match) {

                visible++;
                metadataMatches++;

                let score = 0;

                if (query === card.dataset.number)
                    score = 100;
                else if (card.dataset.title.startsWith(query))
                    score = 90;
                else if (card.dataset.title.includes(query))
                    score = 80;
                else if (card.dataset.file.includes(query))
                    score = 70;
                else if (card.dataset.description.includes(query))
                    score = 60;

                matchedCards.push({
                    card,
                    score
                });
            }

        });

        const total = App.cards[folder].length;

        if (query && metadataMatches === 0) {

            await loadCodeIndex();

            visible = 0;

            App.cards[folder].forEach(card => {

                const searchable =
                    App.codeLookup[card.dataset.path]?.search || "";

                const codeMatch = keywords.every(word =>
                    searchable.includes(word)
                );

                const badge =
                    card.querySelector(".code-match-badge");

                if (codeMatch) {

                    card.style.display = "";
                    card.dataset.codeMatch = "true";
                    badge.style.display = "inline-block";
                    visible++;

                } else {

                    card.style.display = "none";
                    card.dataset.codeMatch = "false";
                    badge.style.display = "none";
                }

            });

        }

        matchedCards
            .sort((a, b) => b.score - a.score)
            .forEach(({ card }) => {
                card.parentNode.appendChild(card);
            });

        status.textContent = query
            ? `Showing ${visible} of ${total} program${total !== 1 ? "s" : ""}`
            : `${total} programs loaded`;

        noResults.style.display =
            visible === 0 ? "block" : "none";

    }

    input.addEventListener("input", filterCards);

    clearBtn.onclick = () => {
        input.value = "";
        filterCards();
        input.focus();
    };

    filterCards();
}// <-- CLOSE setupSearch()

    
function createProgramCard(program, lang) {

    const card = document.createElement("div");
    card.className = "program-card collapsed";

    card.dataset.number = String(program.number);
    card.dataset.title = program.title.toLowerCase();
    card.dataset.file = program.file.toLowerCase();
    card.dataset.description = (program.description || "").toLowerCase();
    card.dataset.path = program.path;
    card.dataset.search = [
    program.title,
    program.file,
    program.description || ""
]
.join(" ")
.toLowerCase();

    const header = document.createElement("div");
    header.className = "card-header";

    header.innerHTML = `
        <div class="title-group">

            <h3 class="card-title">
                <span class="serial-badge">${program.number}</span>

                <span class="program-title-text">
                    ${program.title}
                </span>
            </h3>

            <span class="file-badge">
                [ ${program.file} ]
            </span>

            <p class="card-subtitle">
                ${program.description || ""}
            </p>
            <div class="code-match-badge">
    Found in source code
</div>

        </div>

        <div class="header-actions">

            <button class="action-btn">
                COPY
            </button>

            <button class="action-btn run-btn">
                RUN PROGRAM ▶
            </button>

            <span class="expand-icon">
                ▼
            </span>

        </div>
    `;

    card.appendChild(header);
    const codeWrapper = document.createElement("div");
codeWrapper.className = "code-wrapper";

const pre = document.createElement("pre");

const codeElement = document.createElement("code");
codeElement.className = `language-${lang}`;

pre.appendChild(codeElement);

codeWrapper.appendChild(pre);

card.appendChild(codeWrapper);

const editorWrapper = document.createElement("div");
editorWrapper.className = "editor-wrapper";

card.appendChild(editorWrapper);

const expandIcon = card.querySelector(".expand-icon");
const copyBtn = card.querySelector(".action-btn");
const runBtn = card.querySelector(".run-btn");
const titleText = card.querySelector(".program-title-text");
const fileBadge = card.querySelector(".file-badge");
const subtitle = card.querySelector(".card-subtitle");
const codeMatchBadge =
    card.querySelector(".code-match-badge");

codeMatchBadge.style.display = "none";
card.originalContent = {
    title: titleText.textContent,
    file: fileBadge.textContent,
    description: subtitle.textContent
};

let loaded = false;
let skeleton = null;

header.onclick = (e) => {

    if (e.target.closest(".action-btn")) return;

    runWithTactileDelay(e, async () => {

        const collapsed = card.classList.toggle("collapsed");

expandIcon.textContent = collapsed ? "▼" : "▲";

if (collapsed) {

    if (editorWrapper.classList.contains("active")) {
        editorWrapper.classList.remove("active");
        runBtn.textContent = "RUN PROGRAM ▶";
    }

    return;
}

if (loaded) return;
skeleton = document.createElement("div");
skeleton.className = "code-skeleton";

for (let i = 0; i < 7; i++) {

    const line = document.createElement("div");
    line.className = "code-skeleton-line";
    skeleton.appendChild(line);

}

pre.style.display = "none";

codeWrapper.insertBefore(skeleton, pre);
const source = await loadProgramCode(program, lang);

codeElement.textContent = source;

skeleton.style.display = "none";
pre.style.display = "block";

Prism.highlightElement(codeElement);

loaded = true;

    }, card);

};
copyBtn.onclick = (e) => {

    e.stopPropagation();

    runWithTactileDelay(e, async () => {

        try {

            const source = await loadProgramCode(program, lang);

            await copyToClipboard(source, codeElement);

            copyBtn.textContent = "COPIED!";

            setTimeout(() => {
                copyBtn.textContent = "COPY";
            }, 1500);

        } catch {

            copyBtn.textContent = "FAILED";

            setTimeout(() => {
                copyBtn.textContent = "COPY";
            }, 1500);

        }

    }, copyBtn);

};
let iframe = null;

runBtn.onclick = (e) => {

    e.stopPropagation();

    runWithTactileDelay(e, async () => {

        if (card.classList.contains("collapsed")) {
            card.classList.remove("collapsed");
            expandIcon.textContent = "▲";
        }

        const source = await loadProgramCode(program, lang);

        if (!loaded) {
            codeElement.textContent = source;

if (skeleton) {
    skeleton.remove();
    skeleton = null;
}

pre.style.display = "block";

Prism.highlightElement(codeElement);

loaded = true;
        }

        if (editorWrapper.classList.contains("active")) {
            editorWrapper.classList.remove("active");
            runBtn.textContent = "RUN PROGRAM ▶";
            return;
        }

        editorWrapper.classList.add("active");
        runBtn.textContent = "CLOSE RUNNER ✖";

        if (!iframe) {

            iframe = document.createElement("iframe");

            iframe.src =
                `https://onecompiler.com/embed/${lang}?theme=dark&hideTitle=true&hideNew=true&hideEditorOptions=true&listenToEvents=true`;

            editorWrapper.appendChild(iframe);

            const populate = () => {

                iframe.contentWindow.postMessage({
                    eventType: "populateCode",
                    language: lang,
                    files: [{
                        name: program.file,
                        content: source
                    }]
                }, "*");

                setTimeout(() => {
                    iframe.contentWindow.postMessage({
                        eventType: "triggerRun"
                    }, "*");
                }, 800);

            };

            window.addEventListener("message", (event) => {

                if (event.source !== iframe.contentWindow) return;

                if (event.data?.action === "onLoad") {
                    populate();
                }

            });

            iframe.onload = () => setTimeout(populate, 1200);

        } else {

            iframe.contentWindow.postMessage({
                eventType: "populateCode",
                language: lang,
                files: [{
                    name: program.file,
                    content: source
                }]
            }, "*");

            setTimeout(() => {
                iframe.contentWindow.postMessage({
                    eventType: "triggerRun"
                }, "*");
            }, 500);

        }

    }, runBtn);

};

    return card;
}

async function loadProgramCode(program, lang) {

    if (App.loadedPrograms.has(program.path)) {
        return App.loadedPrograms.get(program.path);
    }

    const response = await fetch("/" + program.path);

    if (!response.ok) {
        throw new Error(`Unable to load ${program.file}`);
    }

    let code = await response.text();

    if (lang === "c") {
        code = cleanTurboC(code);
    }

    App.loadedPrograms.set(program.path, code);

    return code;
}

async function loadFolder(folderName, containerId, lang) {

    const container = document.getElementById(containerId);

    container.innerHTML = "";

    const search = createSearchUI(container, folderName);

const programs = getPrograms(folderName);

App.cards[folderName] = [];

for (const program of programs) {

    const card = createProgramCard(program, lang);

    container.appendChild(card);

    App.cards[folderName].push(card);

}

setupSearch(search, folderName);

}

async function init() {

    const savedTheme =
        localStorage.getItem("theme") || "light";

    applyTheme(savedTheme);

    await loadLanguageIndex();

    buildLanguageUI();

    await loadSearchIndex();

    const siteInfo = await loadSiteInfo();

    if (siteInfo?.github) {

        document.getElementById("app-footer").innerHTML = `
    Built with
    <a
        href="https://github.com/aafthxb/LabRecord"
        target="_blank"
        rel="noopener noreferrer">
        LabRecord</a>
    · Created by
    <a
        href="${siteInfo.github.url}"
        target="_blank"
        rel="noopener noreferrer">
        ${siteInfo.github.username}
    </a>
`;

    }

    for (const language of App.languageIndex) {

        await loadFolder(
            language.folder,
            `${language.folder}-container`,
            language.compiler
        );

    }

}
const themeBtn = document.getElementById("theme-btn");

themeBtn.addEventListener("click", toggleTheme);

init();