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
    }, 70);
    return;
  }

  callback();
}
const SEARCH_ANIMATION_DURATION = 220;

const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const supportsHover =
    window.matchMedia("(hover: hover)").matches;

function applyTheme(theme, animate = true) {

    document.documentElement.setAttribute("data-theme", theme);

    const themeBtn = document.getElementById("theme-btn");
    const icon = themeBtn?.querySelector(".theme-icon") || themeBtn;

    if (icon) {

        const nextEmoji = theme === "dark" ? "☀️" : "🌙";

        if (animate) {

            icon.classList.add("theme-icon-flip");

            setTimeout(() => {
                icon.textContent = nextEmoji;
            }, 125);

            setTimeout(() => {
                icon.classList.remove("theme-icon-flip");
            }, 250);

        } else {
            icon.textContent = nextEmoji;
        }
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

        // Build this folder's program cards on first open only.
        // Building every language upfront (during init) was what caused
        // the noticeable delay, especially for larger folders like C/Java.
        if (!App.builtFolders.has(folder)) {
            const language = App.languageIndex.find(l => l.folder === folder);
            loadFolder(folder, `${folder}-container`, language?.compiler);
            App.builtFolders.add(folder);
        }

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
        "Interactive Programming Lab Record<br>Browse, search, and run programs by language.";

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function playBootIntro() {

    const titleEl = document.getElementById("page-title");
    const text = titleEl.textContent.trim();

    titleEl.textContent = "";

    [...text].forEach((char, i) => {
        const span = document.createElement("span");
        span.textContent = char === " " ? "\u00A0" : char;
        span.className = "boot-letter";
        span.style.setProperty("--i", i);
        titleEl.appendChild(span);
    });

    titleEl.classList.add("title-visible");

    const subtitleEl = document.getElementById("page-subtitle");
    const bootDelay = text.length * 35 + 150;

    subtitleEl.classList.add("boot-subtitle");
    subtitleEl.style.setProperty("--boot-delay", `${bootDelay}ms`);

    document.getElementById("home-view")
        .style.setProperty("--boot-offset", `${text.length * 35 + 380}ms`);
}

function setupScrollHeader() {

    const header = document.querySelector(".app-header");
    if (!header) return;

    const ENTER_THRESHOLD = 70;
    const EXIT_THRESHOLD = 10;

    let ticking = false;
    let isScrolled = false;

    window.addEventListener("scroll", () => {

        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {

            const y = window.scrollY;

            if (!isScrolled && y > ENTER_THRESHOLD) {
                isScrolled = true;
            } else if (isScrolled && y < EXIT_THRESHOLD) {
                isScrolled = false;
            }

            header.classList.toggle("scrolled", isScrolled);
            ticking = false;
        });

    }, { passive: true });
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

    loadedPrograms: new Map(),
    builtFolders: new Set()
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

    App.languageIndex.forEach((language, index) => {

        // ---------- Home Card ----------
        const card = document.createElement("div");
        card.className = "folder-card card-enter";
        card.style.setProperty("--stagger-index", index);

        card.addEventListener(
            "animationend",
            () => card.classList.remove("card-enter"),
            { once: true }
        );

        card.onclick = (event) => openFolder(language.folder, event);

        if (supportsHover && !prefersReducedMotion) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const py = (e.clientY - rect.top) / rect.height - 0.5;

                card.style.setProperty("--magnet-y", `${(py * 6).toFixed(2)}px`);
            });

            card.addEventListener("mouseleave", () => {
                card.style.removeProperty("--magnet-y");
            });
        }

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
function animateCard(card, show) {

    if (show) {

        card.style.display = "";

        requestAnimationFrame(() => {
            card.classList.remove("search-hidden");
        });

    } else {

        card.classList.add("search-hidden");

        setTimeout(() => {
            if (card.classList.contains("search-hidden")) {
                card.style.display = "none";
            }
        }, SEARCH_ANIMATION_DURATION);

    }

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

            animateCard(card, match);

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

                    animateCard(card, codeMatch);
                    card.dataset.codeMatch = "true";
                    badge.style.display = "inline-block";
                    visible++;

                } else {

                    animateCard(card, false);
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

            runBtn.classList.add("is-loading");

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
                    runBtn.classList.remove("is-loading");
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

            runBtn.classList.add("is-loading");

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
                runBtn.classList.remove("is-loading");
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

programs.forEach((program, index) => {

    const card = createProgramCard(program, lang);
    card.classList.add("card-enter");
    card.style.setProperty("--stagger-index", Math.min(index, 14));

    card.addEventListener(
        "animationend",
        () => card.classList.remove("card-enter"),
        { once: true }
    );

    container.appendChild(card);

    App.cards[folderName].push(card);

});

setupSearch(search, folderName);

}

async function init() {

    const savedTheme =
        localStorage.getItem("theme") || "light";

    applyTheme(savedTheme, false);

    if (!prefersReducedMotion) {
        // Wait for the Courier Prime webfont to finish loading before
        // splitting the title into letters and animating it. On a cold/
        // hard refresh the fallback font renders first; if the animation
        // starts before the swap to Courier Prime, every letter's width
        // changes mid-animation, which is what caused the jitter.
        if (document.fonts && document.fonts.ready) {
            Promise.race([
                document.fonts.ready,
                new Promise(resolve => setTimeout(resolve, 500))
            ]).then(playBootIntro);
        } else {
            playBootIntro();
        }
    } else {
        document.getElementById("page-title").classList.add("title-visible");
        document.getElementById("page-subtitle").style.opacity = "1";
    }

    setupScrollHeader();

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

    // Note: folders are no longer built eagerly here. Each folder's
    // program cards are now built lazily on first open (see openFolder),
    // which keeps initial load fast and avoids the delay large folders
    // like C/Java caused when everything was rendered upfront.

}
const themeBtn = document.getElementById("theme-btn");

themeBtn.addEventListener("click", toggleTheme);
if ("serviceWorker" in navigator) {

    let swRefreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {

        // Guard against firing more than once. Without this, an update
        // landing right after page load can force a reload mid-animation
        // (boot intro, theme toggle, etc.) and, in the worst case, a
        // reload loop — this was most visible on mobile right after a
        // fresh deploy, since that's when the new service worker is most
        // likely to activate moments after the page has already loaded.
        if (swRefreshing) return;
        swRefreshing = true;

        window.location.reload();

    });

}
init();