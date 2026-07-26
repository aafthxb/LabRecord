<div align="center">

# 📚 Interactive Programming Lab Record

**A beautiful, searchable, and interactive Programming Lab Record.**<br>
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

```text
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
