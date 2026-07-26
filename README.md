<div align="center">

# 📚 LabRecord

### Interactive Programming Lab Record<br>
Organize programs by language, search instantly, copy code, and run programs online — all from a modern, responsive website.

⭐ Fork • 🚀 Deploy • 📚 Upload Programs • ✨ Done

</div>

---

## 🌟 Why This Project?

Most Programming Lab Record websites require editing HTML, JavaScript, or configuration files whenever you add a new program. 

**This project is different.** You simply organize your source files into folders, and everything else happens automatically.

* 📂 A language folder becomes a language button.
* 📄 A source file becomes a program card.
* 🔍 Search indexes are generated automatically.
* 🎨 Syntax highlighting is configured automatically.
* 🚀 GitHub Actions regenerates the project.
* 🌐 Vercel deploys the latest version automatically.

For most users, **no Git, Node.js, terminal, or programming setup is required.**

---

## 🚀 Create Your Own Programming Lab Record

> [!TIP]
> If you've never used GitHub before, don't worry. This project is designed so that you can manage everything directly from the GitHub website.

### Step 1 — Fork this Repository
Click the **Fork** button in the top-right corner of this page. This creates your own copy of the project.

### Step 2 — Deploy with Vercel
1. Sign in to Vercel with GitHub.
2. Click **Add New Project**.
3. Import your fork.
4. Click **Deploy**.

Your website is now live.

### Step 3 — Start Uploading Programs
From now on, you only need GitHub. Whenever you upload, edit, or remove programs and commit the changes:

* GitHub Actions updates the generated files.
* Vercel deploys the latest version automatically.

No manual build steps are required.

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
    Commit Changes
          │
          ▼
    GitHub Actions
          │
          ▼
    Updated Website

You only manage your program files. The project manages everything else.

---

## ✅ Built-in Programming Languages

The following languages are already configured.

| Language | Folder | Extension | Configuration Needed? |
| :--- | :--- | :--- | :--- |
| **C** | `programs/C/` | `.c` | ❌ No |
| **C++** | `programs/CPP/` | `.cpp` | ❌ No |
| **Java** | `programs/Java/` | `.java` | ❌ No |
| **JavaScript** | `programs/JavaScript/` | `.js` | ❌ No |
| **Python** | `programs/Python/` | `.py` | ❌ No |

> [!IMPORTANT]
> If you're using one of the languages above, **do not edit `languages.json`.**
> 
> Simply create (or use) the corresponding folder, upload your source files, commit the changes, and the website updates automatically.

---

## 📂 Adding Programs

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
> Always keep these two comment lines at the top of every source file.

---

## ➕ Adding Another Programming Language

Only do this if the language is **not** already listed above (e.g., Rust, Go, Kotlin, Swift).

**Steps:**
1. Create a new folder inside `programs/`.
2. Add your source files.
3. Add the language configuration to `languages.json`.
4. Commit your changes.

The homepage automatically gains a new language button.

---

## 🗑️ Removing Programs or Languages

Removing content is just as easy.

### Remove a Program File
Delete a source file.
✅ The corresponding program card disappears automatically.

### Remove a Language Folder
Delete an entire language folder.
✅ The homepage language button disappears.
✅ All programs belonging to that language disappear.

No additional cleanup is required.

---

## 🔢 Changing the Program Order

Edit `generated/order.json` and move filenames up or down. The website displays cards in the same order.

---

## 📁 Project Structure

    .
    ├── assets/
    ├── generated/
    ├── programs/
    │   ├── C/
    │   ├── CPP/
    │   ├── Java/
    │   ├── JavaScript/
    │   └── Python/
    ├── scripts/
    ├── languages.json
    ├── script.js
    ├── style.css
    ├── index.html
    └── README.md

---

## 💻 Local Development (Optional)

Only needed if you want to modify the project itself.

    git clone https://github.com/<your-username>/<repository>.git
    npm install
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
