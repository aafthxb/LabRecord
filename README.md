<div align="center">

# 📚 Interactive Programming Lab Record

**A beautiful, searchable, and interactive Programming Lab Record.**<br>
Organize programs by language, search instantly, copy code, and run programs online — all from a modern, responsive website.

⭐ Fork • 🚀 Deploy • ✏️ Add Programs From Your Browser • ✨ Done

</div>

---

## 🌟 Why This Project?

Most Programming Lab Record websites require editing HTML, JavaScript, or configuration files whenever you add a new program.

**This project is different.** Add, edit, delete, and reorder programs straight from the website — no Git, no terminal, and no code editor required.

* ✏️ A built-in **web editor** lets you add new programs from your phone or laptop — no GitHub website needed.
* 📷 Snap a photo of handwritten or printed code and let OCR extract it for you.
* 📂 A language folder becomes a language button.
* 📄 A source file becomes a program card.
* 🔍 Search indexes are generated automatically.
* 🎨 Syntax highlighting is configured automatically.
* ✏️ Add, edit, delete, or reorder programs — including a program's code and its title/description comment lines — directly on the homepage.
* 📱 Installable as a home-screen app via its PWA manifest.
* 🚀 GitHub Actions regenerates the project.
* 🌐 Vercel deploys the latest version automatically.

For most users, **no Git, Node.js, terminal, or programming setup is required — not even a trip to GitHub.com.**

---

## 🚀 Create Your Own Programming Lab Record

> [!TIP]
> If you've never used GitHub before, don't worry. Once deployed, everyday use — adding, editing, deleting, reordering programs — happens entirely through the site's own editor.

### Step 1 — Create Your Copy

If you're starting a new Programming Lab Record, click **Use this template** at the top of this repository.

This creates a brand-new repository in your GitHub account with all of LabRecord's files, ready for you to customize.

> [!NOTE]
> If you prefer, you can also **Fork** this repository. Using the template is recommended because it creates an independent repository without a fork relationship.

### Step 2 — Deploy with Vercel

1. Sign in to Vercel with GitHub.
2. Click **Add New Project**.
3. Import your fork.
4. Add the environment variables below (needed for the built-in editor to be able to commit to your repo).
5. Click **Deploy**.

Your website is now live.

#### Required environment variables

The site's editor commits directly to your repo on your behalf through GitHub's API, so it needs a token and a passphrase. Set these in your Vercel project's **Settings → Environment Variables**:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `GITHUB_TOKEN` | ✅ | A fine-grained GitHub PAT with **Contents: Read and write** access on this repo. Never exposed to the browser. |
| `GITHUB_OWNER` | ✅ | Your GitHub username or org, e.g. `aafthxb`. |
| `GITHUB_REPO` | ✅ | The repository name, e.g. `LabRecord`. |
| `GITHUB_BRANCH` | ❌ | Branch to commit to. Defaults to `main`. |
| `EDITOR_ACCESS_CODE` | ✅ | A passphrase of your choosing. Anyone entering this unlocks the editor — keep it private. |

### Step 3 — Start Adding Programs

Once deployed, everything happens on the site itself:

* Click the **✏️ pencil icon** on the homepage and enter your access code to unlock editing tools.
* Add new programs through the built-in editor (see below).
* Edit, delete, or reorder existing programs directly on the homepage.
* GitHub Actions updates the generated files and Vercel redeploys automatically after every change.

No manual build steps, and no need to open GitHub.com at all — though you still can, if you'd rather upload files there directly (see [Adding Programs Manually](#-adding-programs-manually-optional) below).

---

## ✏️ The Built-in Web Editor

Unlock editing tools from the homepage by clicking the **pencil icon** (✏️) in the top-right corner and entering your access code. This works on both desktop and mobile.

Once unlocked, an **[ + ]** button appears whenever you're inside a language folder — click it to open the editor and add a new program. You get three ways to add code:

| Method | Best for |
| :--- | :--- |
| 📷 **Upload / paste screenshots** | Handwritten or printed code — photograph it (or paste a screenshot with Ctrl/Cmd+V) and OCR (via Tesseract.js) extracts the text for you to review and edit. |
| ⌨️ **Paste / type code directly** | Skip OCR entirely and paste or type the program by hand. |
| 📁 **Upload finished files** | Already have working source files? Select up to 50 at a time — rename, reorder, and check each one's title/description on the review screen, then everything lands in **one commit**, so uploading 10 files doesn't trigger 10 separate GitHub Actions runs / Vercel deploys. |

In every case, if a program's title/description comment isn't detected automatically, the review screen shows a box to fill them in and insert them at the top of the file for you.

### Editing, Deleting & Reordering

With editing tools unlocked, open any language folder on the homepage to:

* **Edit** a program's code in place — expand its card and the read-only view turns into an editable textarea, including the first two comment lines that set its title and description.
* **Delete** a program with one click.
* **Reorder** programs by dragging them into place.

A card with changes not yet committed shows an **UNSAVED** badge. Changes are staged locally first — a **Save Changes / Discard** bar appears at the bottom of the screen so you can review everything before committing. Saving applies all your edits, deletions, and the new order as a single commit.

---

## 💡 Understanding How the Project Works

Everything is generated from one folder: `programs/`

Think of it like this:

    Language Folder
          │
          ▼
    Homepage Language Button
          │
          ▼
    Program Files
          │
          ▼
    Program Cards
          │
          ▼
    Commit Changes (via the editor, or manually on GitHub)
          │
          ▼
    GitHub Actions
          │
          ▼
    Updated Website

You only manage your program files — through the site's editor or directly on GitHub. The project manages everything else.

---

## ✅ Built-in Programming Languages

The following languages are already configured.

| Language | Folder | Extensions | Configuration Needed? |
| :--- | :--- | :--- | :--- |
| **C** | `programs/C/` | `.c` | ❌ No |
| **C++** | `programs/CPP/` | `.cpp`, `.cc`, `.cxx` | ❌ No |
| **Java** | `programs/Java/` | `.java` | ❌ No |
| **JavaScript** | `programs/JavaScript/` | `.js` | ❌ No |
| **Python** | `programs/Python/` | `.py` | ❌ No |

> [!IMPORTANT]
> If you're using one of the languages above, **do not edit `languages.json`.**
>
> Simply add programs through the built-in editor (or upload files to the corresponding folder), and the website updates automatically.

---

## 📂 Adding Programs Manually (Optional)

You don't need this if you're using the built-in editor — it's here for anyone who prefers working directly on GitHub, or wants to add several files without going through the site.

**Example:**

    programs/
    └── C/
        ├── Hello World.c
        ├── Bubble Sort.c
        └── Binary Search.c

After committing:
* A program card is created for every file.
* Search is updated.
* Syntax highlighting is updated.
* The website is redeployed.

---

## 📝 Program Card Titles & Descriptions

Every program card gets its title and description from the **first two comment lines** of the source file.

**Example (`Bubble Sort.c`):**

    // Bubble Sort
    // Sort an array using Bubble Sort.
    
    #include<stdio.h>

| Comment Position | Example | Becomes |
| :--- | :--- | :--- |
| **First Comment** | `// Bubble Sort` | Program Title |
| **Second Comment** | `// Sort an array using Bubble Sort.` | Program Description |

> [!IMPORTANT]
> Always keep these two comment lines at the top of every source file. The built-in editor will offer to insert them for you if they're missing.

---

## ➕ Adding Another Programming Language

Only do this if the language is **not** already listed above (e.g., Rust, Go, Kotlin, Swift).

> [!NOTE]
> **The built-in web editor can't create a new language folder** — it only adds, edits, deletes, and reorders programs inside languages that already exist. (Deletion is the one thing that works both ways: since Git doesn't track empty folders, deleting every program in a folder through the editor removes the folder itself. Creating one has no such shortcut — it has to be set up manually on GitHub, as below.)

**Steps:**
1. Create a new folder inside `programs/`.
2. Add your source files.
3. If this language isn't one of the five listed under [Built-in Programming Languages](#-built-in-programming-languages) already, add its configuration to `languages.json` — this step is only needed the first time a given language is used.
4. Commit your changes.

The homepage automatically gains a new language button. Once the folder and `languages.json` entry (if needed) exist, the editor can add further programs to it normally.

---

## 🗑️ Removing Programs or Languages

Removing content is just as easy.

### Remove a Program File
Delete it from the homepage's edit mode, or delete the source file directly on GitHub.
✅ The corresponding program card disappears automatically.

### Remove a Language Folder
Git doesn't track empty folders, so once the last program inside a language folder is gone, the folder itself is gone too — no separate "delete folder" step exists or is needed.

You can get there either way:
* **From the website:** open that folder in edit mode and delete each program from its card, one at a time. Once it's empty, the folder — and the homepage's language button for it — disappears on the next deploy.
* **On GitHub:** delete the folder directly.

✅ The homepage language button disappears.
✅ All programs belonging to that language disappear.

No additional cleanup is required.

---

## 🔢 Changing the Program Order

Drag programs into place from the homepage's edit mode, or manually edit `generated/order.json` and move filenames up or down. The website displays cards in the same order.

---

## 📁 Project Structure

    .
    ├── .github/
    │   └── workflows/
    │       └── update-order.yml   # Regenerates generated/ and commits after every push to main
    ├── api/              # Serverless functions powering the web editor
    │   ├── _lib.js            # Shared helpers (sanitizing, languages.json loading/lookup) used by every endpoint below
    │   ├── commit.js          # Add one new file
    │   ├── update.js          # Edit an existing file's content in place
    │   ├── delete.js          # Delete one file
    │   ├── batch-commit.js    # Add multiple new files in a single commit
    │   ├── batch-save.js      # Apply edits + deletions + reorder in a single commit
    │   └── verify.js          # Check the editor access code
    ├── assets/
    ├── generated/
    ├── programs/
    │   ├── C/
    │   ├── CPP/
    │   ├── Java/
    │   ├── JavaScript/
    │   └── Python/
    ├── scripts/
    │   ├── generate-index.js
    │   └── languages.json
    ├── script.js
    ├── style.css
    ├── sw.js             # Service worker
    ├── site.webmanifest  # PWA manifest (install/home-screen metadata)
    ├── editor.html       # Add-a-program wizard (screenshots / paste / bulk upload)
    ├── editor.js
    ├── editor.css
    ├── index.html
    ├── package.json
    ├── LICENSE
    └── README.md

---

## 💻 Local Development (Optional)

Only needed if you want to modify the project itself.

    git clone https://github.com/<your-username>/<repository>.git
    npm run generate

---

## 🤝 Contributing

Contributions are welcome! Whether it's:
* Supporting new languages
* Fixing bugs
* Improving the UI
* Improving the documentation
* Suggesting new features

...feel free to open an Issue or Pull Request.

---

## 📄 License

Licensed under the MIT License.

---

<div align="center">
If this project helped you, consider giving it a ⭐ on GitHub!
</div>
