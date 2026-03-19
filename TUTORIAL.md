# TaskFlow: A Complete Tide Code Tutorial

> Build a full-stack todolist application while mastering every feature of Tide Code — from basic editing to AI-powered orchestration.

**What you'll build:** TaskFlow — a full-stack task management app with a React frontend, Python (FastAPI) backend, and a static landing page.

**What you'll learn:** Every major feature of Tide Code, introduced naturally as you need it.

**Who this is for:** Junior developers who can write code and have used a code editor, but are new to AI-assisted development.

**Time to complete:** 3-5 hours (you can stop and resume between chapters)

## Prerequisites

Before starting, make sure you have:

- **Tide Code** installed ([download here](https://github.com/narcofreccia/tide_code))
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Python 3.10+** — [python.org](https://python.org)  
- **Git** — [git-scm.com](https://git-scm.com)
- **An AI provider API key** — at least one of:
  - Anthropic (Claude) — recommended
  - OpenAI (GPT-4)
  - Google (Gemini)

---

## Chapter 1: Getting Started

### What Is Tide Code?

If you've used VS Code, Sublime Text, or any other code editor, you already have an intuition for what Tide Code does. But Tide Code is not just another editor with an AI plugin bolted on.

Tide Code is an **AI-native IDE** — that means artificial intelligence isn't an afterthought; it's woven into the core experience. Under the hood, it's built with **Tauri**, a framework that pairs a Rust backend for performance and system access with a React frontend for a modern, responsive interface. This architecture gives you the speed of a native desktop app without the memory bloat of Electron-based editors.

The standout feature is **Pi**, Tide Code's built-in AI agent. Pi isn't just an autocomplete engine. It can read your files, write code across multiple files at once, execute terminal commands, search the web, and reason about your entire project. Think of Pi as a junior pair programmer sitting next to you — one that never gets tired and has read a lot of documentation.

Throughout this tutorial, you'll meet Pi gradually. For now, let's get familiar with the basics.

### Launching Tide Code

Open Tide Code the same way you'd open any desktop application — double-click the icon on your desktop, find it in your Start menu (Windows), Applications folder (macOS), or app launcher (Linux).

When Tide Code launches for the first time, you'll see the **Dashboard**. This is your home base.

### 🔧 Tide Code Feature: Dashboard

The Dashboard is the first screen you see when Tide Code opens. It serves two purposes:

1. **Recent Workspaces** — A list of projects you've opened before, sorted by last accessed. Click any one to jump right back in.
2. **Create / Open Workspace** — Buttons to start a new project or open an existing folder.

Since this is your first time, the recent workspaces list will be empty. That's about to change.

### Creating the TaskFlow Project

Before you open anything in Tide Code, you need a project folder. Open your system's file manager or a terminal and create the following structure:

```
taskflow/
├── landing/
├── backend/
└── frontend/
```

You can do this from a terminal:

```bash
mkdir taskflow
cd taskflow
mkdir landing backend frontend
```

Here's what each directory will hold:

- **`landing/`** — A static HTML/CSS/JS landing page for TaskFlow (Chapter 2)
- **`backend/`** — A Python FastAPI server with a SQLite database (Chapter 3)
- **`frontend/`** — A React + TypeScript single-page application (later chapters)

Now go back to Tide Code's Dashboard and click **Open Workspace** (or **Open Folder**, depending on your version). Navigate to the `taskflow/` directory you just created and select it.

Tide Code will open the folder and you'll see the full IDE interface appear.

> 📖 **What just happened?** Tide Code opened your `taskflow/` folder as a "workspace." A workspace is simply a directory that Tide Code treats as the root of your project. All file operations, terminal sessions, and AI context will be scoped to this directory.

### Understanding the UI Layout

Take a moment to look around. Tide Code's interface is divided into four main areas:

```
┌──────────┬─────────────────────────┬──────────────┐
│          │                         │              │
│  File    │     Editor Area         │   Agent      │
│  Tree    │     (center)            │   Panel      │
│  (left)  │                         │   (right)    │
│          │                         │              │
│          ├─────────────────────────┤              │
│          │     Terminal            │              │
│          │     (bottom)            │              │
└──────────┴─────────────────────────┴──────────────┘
```

1. **Left Sidebar — File Tree**: This shows every file and folder in your workspace. Right now you'll see three empty folders: `backend/`, `frontend/`, and `landing/`.

2. **Center — Editor Area**: This is where you write code. When you open a file, it appears here as a tab. You can have multiple files open at once, just like browser tabs.

3. **Bottom — Terminal**: An integrated terminal so you never have to leave the IDE to run commands. You can open multiple terminal tabs and even split them.

4. **Right — Agent Panel**: This is where Pi lives. You can chat with the AI, give it instructions, and watch it work. We'll explore this in later chapters.

> 💡 **Tip:** If any panel isn't visible, don't worry. You can toggle panels from the View menu or by using keyboard shortcuts. The layout is flexible — you can drag dividers to resize any section.

### 🔧 Tide Code Feature: File Tree

The File Tree on the left sidebar is your primary way to navigate project files. Here's how to use it:

- **Expand a folder** — Click the arrow (▶) next to any folder name, or just click the folder itself. It will expand to show its contents.
- **Open a file** — Click on any file name. It will open in the editor area as a new tab.
- **Icons** — Tide Code uses different icons for different file types. You'll see distinct icons for `.html`, `.css`, `.js`, `.py`, `.json`, `.md`, and many more. These visual cues help you quickly identify file types at a glance.
- **Collapse all** — If your tree gets unwieldy, look for the collapse-all button at the top of the file tree panel.

Right now your file tree is sparse — just three empty folders. Let's fix that.

### Creating Files and Folders

You can create files and folders directly from the file tree without touching the terminal.

**To create a file:**

1. Right-click on the folder where you want the file to live (or right-click in empty space for the project root).
2. Select **New File** from the context menu.
3. Type the file name (including the extension) and press Enter.

**To create a folder:**

1. Right-click on the parent directory.
2. Select **New Folder** from the context menu.
3. Type the folder name and press Enter.

Let's practice. Right-click on the root of your project (the `taskflow/` area at the top of the file tree) and create a new file called `README.md`.

> 💡 **Tip:** You can also create files by right-clicking on a specific folder. For example, right-clicking on `landing/` and choosing "New File" will create the file inside that folder automatically.

### 🔧 Tide Code Feature: Monaco Editor

When you click on `README.md` in the file tree, it opens in the center editor area. Tide Code uses the **Monaco Editor** — the same editor engine that powers VS Code. This means you get:

- **Syntax highlighting** — Code is color-coded by language. Markdown, Python, JavaScript, HTML, CSS, and dozens of other languages are supported out of the box.
- **Line numbers** — Displayed on the left edge of the editor.
- **Minimap** — A zoomed-out preview of your file on the right edge (useful for long files).
- **Auto-indentation** — When you press Enter, the cursor indents to the right level automatically.
- **Bracket matching** — Click next to a bracket and its partner will be highlighted.

You don't need to configure any of this. It works immediately based on the file extension.

### Writing the README

With `README.md` open in the editor, type the following content. This is your first hands-on experience with the Monaco editor, so take your time and get comfortable.

```markdown
# TaskFlow

A full-stack task management application built as a learning project.

## Overview

TaskFlow helps you organize your work with a clean, intuitive interface.
It features a React frontend, a Python (FastAPI) backend, and a SQLite
database — all tied together with a modern landing page.

## Project Structure

- `landing/` — Static HTML/CSS/JS landing page
- `backend/` — Python FastAPI REST API
- `frontend/` — React + TypeScript single-page application

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** Python 3.10+, FastAPI, SQLite
- **Landing Page:** Vanilla HTML, CSS, JavaScript

## Getting Started

Instructions for setting up and running each component can be found
in their respective directories.

## License

MIT
```

As you type, notice how the Monaco editor handles Markdown:

- Headings (`#`, `##`) appear in a different color than body text.
- Bold text (`**text**`) is highlighted.
- Code spans (`` `text` ``) get their own distinct styling.
- Lists are auto-indented when you press Enter after a list item.

Save the file by pressing **Ctrl+S** (or **Cmd+S** on macOS). You'll see the file name in the tab lose any "unsaved" indicator (often a dot or a different color).

> 📖 **What just happened?** You created your first file in Tide Code and practiced basic editing. The `README.md` serves as documentation for anyone (including future you) who opens this project. Writing a README first is a good habit — it forces you to think about what you're building before you write any code.

### Navigating the File Tree — A Closer Look

Now that you have a file in your project, let's observe a few more things about the file tree:

- Your `README.md` file appears at the root level of the tree, alongside the three folders.
- The folders appear first (sorted alphabetically), then files appear below them. This is a common convention that keeps your tree organized.
- If you click on `backend/` to expand it, you'll see it's empty. That's expected — we'll fill it in Chapter 3.

Try clicking between `README.md` in the file tree and the empty folders. Notice how clicking a file opens (or focuses) its tab in the editor, while clicking a folder simply expands or collapses it.

### Chapter 1 Recap

Here's what you've accomplished:

- **Learned what Tide Code is** — an AI-native IDE built with Tauri (Rust + React), featuring a built-in AI agent called Pi.
- **Launched Tide Code** and explored the Dashboard.
- **Created the TaskFlow project** with the `landing/`, `backend/`, and `frontend/` directories.
- **Understood the UI layout** — file tree (left), editor (center), terminal (bottom), agent panel (right).
- **Navigated the file tree** — expanding folders, recognizing file type icons, and understanding the hierarchy.
- **Created files via the context menu** — right-click, New File, type the name.
- **Edited your first file** — wrote a `README.md` using the Monaco editor with syntax highlighting.

In the next chapter, you'll build a real landing page and learn about multi-tab editing, keyboard shortcuts, and version control.

---

## Chapter 2: Building the Landing Page (HTML/CSS/JS)

In this chapter, you'll create a polished landing page for TaskFlow using plain HTML, CSS, and JavaScript — no frameworks, no build tools. Along the way, you'll learn how to work with multiple files simultaneously, use keyboard shortcuts to speed up your workflow, and make your first git commit.

### Planning the Landing Page

Every good landing page has a clear structure. Here's what you'll build:

1. **Hero section** — A bold headline, a tagline, and a call-to-action button.
2. **Features section** — Three or four cards highlighting what TaskFlow offers.
3. **How it works section** — A numbered walkthrough of the user flow.
4. **Call-to-action (CTA) section** — A final nudge to get started.
5. **Footer** — Copyright and links.

You'll create three files: `index.html` for structure, `styles.css` for presentation, and `script.js` for interactivity.

### Creating the HTML File

In the file tree, right-click on the `landing/` folder and select **New File**. Name it `index.html`.

The file opens automatically in the editor. Type the following complete HTML document:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaskFlow — Organize Your Work, Effortlessly</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar">
        <div class="container">
            <a href="#" class="logo">
                <span class="logo-icon">✓</span> TaskFlow
            </a>
            <ul class="nav-links">
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
                <li><a href="#cta" class="btn btn-nav">Get Started</a></li>
            </ul>
        </div>
    </nav>

    <!-- Hero Section -->
    <header class="hero">
        <div class="container">
            <h1 class="hero-title">
                Organize your work,<br>
                <span class="gradient-text">effortlessly.</span>
            </h1>
            <p class="hero-subtitle">
                TaskFlow is a clean, fast task manager that gets out of your way.
                Create tasks, set priorities, track progress — all in one place.
            </p>
            <div class="hero-actions">
                <a href="#cta" class="btn btn-primary btn-large">Start Organizing</a>
                <a href="#features" class="btn btn-secondary btn-large">See Features</a>
            </div>
        </div>
    </header>

    <!-- Features Section -->
    <section id="features" class="features">
        <div class="container">
            <h2 class="section-title">Everything you need, nothing you don't</h2>
            <p class="section-subtitle">
                TaskFlow focuses on the essentials so you can focus on your work.
            </p>
            <div class="features-grid">
                <div class="feature-card" data-feature="priorities">
                    <div class="feature-icon">🎯</div>
                    <h3>Smart Priorities</h3>
                    <p>
                        Assign low, medium, or high priority to every task.
                        The most important work always floats to the top.
                    </p>
                </div>
                <div class="feature-card" data-feature="categories">
                    <div class="feature-icon">📂</div>
                    <h3>Categories</h3>
                    <p>
                        Group tasks into categories like "Work," "Personal,"
                        or "Learning." Filter instantly to find what matters.
                    </p>
                </div>
                <div class="feature-card" data-feature="dates">
                    <div class="feature-icon">📅</div>
                    <h3>Due Dates</h3>
                    <p>
                        Set deadlines and never miss them. TaskFlow highlights
                        overdue tasks so nothing slips through the cracks.
                    </p>
                </div>
                <div class="feature-card" data-feature="api">
                    <div class="feature-icon">⚡</div>
                    <h3>REST API</h3>
                    <p>
                        Built on FastAPI, TaskFlow exposes a full REST API.
                        Integrate with other tools or build your own clients.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- How It Works Section -->
    <section id="how-it-works" class="how-it-works">
        <div class="container">
            <h2 class="section-title">Up and running in three steps</h2>
            <div class="steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <h3>Create a Task</h3>
                    <p>
                        Give your task a title, an optional description,
                        a priority level, and a due date. That's it.
                    </p>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <h3>Organize & Prioritize</h3>
                    <p>
                        Use categories and priorities to keep your list
                        tidy. Filter and sort to see exactly what you need.
                    </p>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <h3>Get It Done</h3>
                    <p>
                        Check off tasks as you complete them. Review your
                        progress and stay motivated.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- CTA Section -->
    <section id="cta" class="cta">
        <div class="container">
            <h2 class="cta-title">Ready to take control of your tasks?</h2>
            <p class="cta-subtitle">
                TaskFlow is free and open source. Start building your
                productivity system today.
            </p>
            <a href="#" class="btn btn-primary btn-large">Get Started Now</a>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <p>© 2026 TaskFlow. Built with care as a learning project.</p>
            <ul class="footer-links">
                <li><a href="#">GitHub</a></li>
                <li><a href="#">Docs</a></li>
                <li><a href="#">License</a></li>
            </ul>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>
```

That's a substantial file. Let's walk through the key decisions:

- **`<meta name="viewport">`** — This tag ensures the page scales correctly on mobile devices. Without it, phones would render the page at a desktop width and then shrink it, making text unreadable.
- **Semantic HTML elements** — You used `<nav>`, `<header>`, `<section>`, and `<footer>` instead of generic `<div>` tags everywhere. Semantic elements tell both browsers and screen readers what role each part of the page plays, improving accessibility.
- **`data-feature` attributes** — On each feature card, you added a custom data attribute. You'll use this later in `script.js` to add interactivity.
- **`&amp;`** — In the "How It Works" section, the ampersand in "Organize & Prioritize" is written as `&amp;`. This is an HTML entity. While modern browsers handle bare `&` characters fine in most cases, using the entity is the correct practice and avoids edge-case parsing issues.
- **Script at the bottom** — The `<script>` tag is placed just before `</body>`, not in `<head>`. This ensures the HTML is fully loaded before JavaScript runs, so your script can safely reference elements on the page.

Press **Ctrl+S** to save.

### 🔧 Tide Code Feature: Multi-Tab Editing

Now you need to create the CSS file. Right-click on `landing/` and create a new file called `styles.css`.

Notice what happened in the editor area: a second tab appeared. You now have `index.html` and `styles.css` open at the same time. Click either tab to switch between files.

This is **multi-tab editing**, and it's fundamental to how you'll work in Tide Code. A few things to know:

- **Click a tab** to switch to that file.
- **Middle-click a tab** (or click the × icon) to close it.
- **Drag a tab** left or right to reorder it. Many developers keep related files next to each other — for example, HTML next to its CSS.
- **Scroll the tab bar** — If you have more tabs than fit on screen, you can scroll through them.

> 💡 **Tip:** If you single-click a file in the file tree, Tide Code opens it in "preview mode" — a temporary tab that gets replaced when you click another file. To pin a file as a permanent tab, double-click it in the file tree, or start editing it. You'll notice preview tabs have their name in *italics*.

### Creating the CSS File

With `styles.css` open, add the following styles. This is a long file, but every section is explained:

```css
/* ============================================
   CSS Reset & Base Styles
   ============================================ */

*,
*::before,
*::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
    font-size: 16px;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: #1a1a2e;
    background-color: #ffffff;
    overflow-x: hidden;
}

a {
    text-decoration: none;
    color: inherit;
}

ul {
    list-style: none;
}

img {
    max-width: 100%;
    display: block;
}

/* ============================================
   Utility Classes
   ============================================ */

.container {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 2rem;
}

.gradient-text {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

/* ============================================
   Buttons
   ============================================ */

.btn {
    display: inline-block;
    padding: 0.625rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    transition: all 0.3s ease;
    cursor: pointer;
    border: none;
}

.btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.btn-secondary {
    background: transparent;
    color: #667eea;
    border: 2px solid #667eea;
}

.btn-secondary:hover {
    background: #667eea;
    color: #ffffff;
    transform: translateY(-2px);
}

.btn-large {
    padding: 0.875rem 2.25rem;
    font-size: 1.125rem;
}

.btn-nav {
    padding: 0.5rem 1.25rem;
    font-size: 0.9rem;
}

/* ============================================
   Navbar
   ============================================ */

.navbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    padding: 1rem 0;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.navbar .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.logo {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1a1a2e;
}

.logo-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    font-size: 1rem;
    margin-right: 0.5rem;
    vertical-align: middle;
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 2rem;
}

.nav-links a {
    font-weight: 500;
    color: #555;
    transition: color 0.3s ease;
}

.nav-links a:hover {
    color: #667eea;
}

/* ============================================
   Hero Section
   ============================================ */

.hero {
    padding: 10rem 0 6rem;
    text-align: center;
    background: linear-gradient(180deg, #f8f9ff 0%, #ffffff 100%);
}

.hero-title {
    font-size: 3.5rem;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 1.5rem;
    letter-spacing: -0.02em;
}

.hero-subtitle {
    font-size: 1.25rem;
    color: #555;
    max-width: 600px;
    margin: 0 auto 2.5rem;
    line-height: 1.8;
}

.hero-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}

/* ============================================
   Features Section
   ============================================ */

.features {
    padding: 6rem 0;
}

.section-title {
    font-size: 2.25rem;
    font-weight: 700;
    text-align: center;
    margin-bottom: 1rem;
    letter-spacing: -0.01em;
}

.section-subtitle {
    text-align: center;
    color: #555;
    font-size: 1.125rem;
    max-width: 550px;
    margin: 0 auto 3.5rem;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 2rem;
}

.feature-card {
    background: #f8f9ff;
    border-radius: 16px;
    padding: 2rem;
    transition: all 0.3s ease;
    border: 1px solid transparent;
    cursor: default;
}

.feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.15);
    border-color: rgba(102, 126, 234, 0.2);
}

.feature-card.highlighted {
    border-color: #667eea;
    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.25);
    transform: translateY(-4px);
}

.feature-icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
}

.feature-card h3 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
}

.feature-card p {
    color: #555;
    font-size: 0.95rem;
    line-height: 1.7;
}

/* ============================================
   How It Works Section
   ============================================ */

.how-it-works {
    padding: 6rem 0;
    background: #f8f9ff;
}

.steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2.5rem;
    margin-top: 3rem;
}

.step {
    text-align: center;
    padding: 2rem;
}

.step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
}

.step h3 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
}

.step p {
    color: #555;
    line-height: 1.7;
    font-size: 0.95rem;
}

/* ============================================
   CTA Section
   ============================================ */

.cta {
    padding: 6rem 0;
    text-align: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.cta-title {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
}

.cta-subtitle {
    font-size: 1.125rem;
    opacity: 0.9;
    max-width: 500px;
    margin: 0 auto 2.5rem;
    line-height: 1.8;
}

.cta .btn-primary {
    background: white;
    color: #667eea;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.cta .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
}

/* ============================================
   Footer
   ============================================ */

.footer {
    padding: 2.5rem 0;
    background: #1a1a2e;
    color: rgba(255, 255, 255, 0.7);
}

.footer .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}

.footer-links {
    display: flex;
    gap: 2rem;
}

.footer-links a {
    color: rgba(255, 255, 255, 0.7);
    transition: color 0.3s ease;
}

.footer-links a:hover {
    color: #ffffff;
}

/* ============================================
   Responsive Design
   ============================================ */

@media (max-width: 768px) {
    .hero-title {
        font-size: 2.25rem;
    }

    .hero-subtitle {
        font-size: 1.05rem;
    }

    .section-title {
        font-size: 1.75rem;
    }

    .nav-links {
        gap: 1rem;
    }

    .footer .container {
        flex-direction: column;
        text-align: center;
    }
}
```

Let's break down the CSS techniques you used:

- **CSS Reset** — The `*` selector at the top removes all default margins and padding. `box-sizing: border-box` makes width calculations predictable by including padding and borders in the element's total width. Without this, padding would add to the width, causing layout headaches.
- **`scroll-behavior: smooth`** — When a user clicks an anchor link (like "Features" in the nav), the browser scrolls smoothly instead of jumping instantly. This small touch makes the page feel polished.
- **CSS Custom Gradient** — The gradient `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` creates a purple-to-violet diagonal blend. It's used across buttons, the hero text, and the CTA section for visual consistency.
- **`backdrop-filter: blur(10px)`** — This makes the navbar background slightly frosted-glass, so content scrolling behind it is blurred. It's a modern CSS feature supported in all major browsers.
- **`transition: all 0.3s ease`** — Animations on hover (like buttons lifting up and cards gaining shadows) use CSS transitions. The `0.3s` duration feels snappy without being jarring.
- **Responsive design** — The `@media` query at the bottom adjusts font sizes and layout for screens narrower than 768px (roughly tablet-sized and below).

Press **Ctrl+S** to save.

### 🔧 Tide Code Feature: Keyboard Shortcuts

You've already used one keyboard shortcut — **Ctrl+S** to save. Let's talk about a few more that will save you time throughout this tutorial:

| Shortcut         | Action                           |
| ---------------- | -------------------------------- |
| **Ctrl+S**       | Save the current file            |
| **Ctrl+Shift+P** | Open the Command Palette         |
| **Ctrl+P**       | Quick file open (search by name) |
| **Ctrl+W**       | Close the current tab            |
| **Ctrl+Tab**     | Cycle through open tabs          |
| **Ctrl+/**       | Toggle line comment              |
| **Ctrl+Z**       | Undo                             |
| **Ctrl+Shift+Z** | Redo                             |

Try opening the **Command Palette** now with **Ctrl+Shift+P**. A search bar appears at the top of the editor. You can type commands like "theme," "font size," or "format" to discover features without navigating menus. Press Escape to close it.

> 💡 **Tip:** The Command Palette is your escape hatch for any feature you can't find in the menus. If you ever think "there must be a way to do this," try the Command Palette first.

### Creating the JavaScript File

Right-click on `landing/` once more and create `script.js`. You now have three tabs open. Take a moment to arrange them in a logical order by dragging: `index.html`, `styles.css`, `script.js`.

### 🔧 Tide Code Feature: Tab Management

With three tabs open, this is a good time to talk about how to manage them:

- **Reorder tabs** — Click and drag a tab left or right to change its position. Keep related files next to each other.
- **Close a tab** — Click the × on the tab, or middle-click the tab, or press **Ctrl+W**.
- **Close other tabs** — Right-click a tab for options like "Close Others," "Close All," or "Close to the Right." These are lifesavers when you have a dozen tabs open.
- **Reopen a closed tab** — If you accidentally close a tab, press **Ctrl+Shift+T** to reopen it (just like in a browser).

Now add the JavaScript code to `script.js`:

```javascript
/**
 * TaskFlow Landing Page — Interactive Behaviors
 *
 * This script adds three enhancements to the landing page:
 * 1. Smooth scroll for navigation links (enhancing the CSS scroll-behavior)
 * 2. Feature card highlight on click
 * 3. Navbar background change on scroll
 */

// ============================================
// 1. Smooth Scrolling for Anchor Links
// ============================================

/**
 * While CSS `scroll-behavior: smooth` handles basic anchor scrolling,
 * this JavaScript version gives us more control — we can offset the
 * scroll position to account for the fixed navbar height.
 */
document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (event) {
        event.preventDefault();

        var targetId = this.getAttribute("href");

        // Skip if the href is just "#"
        if (targetId === "#") {
            return;
        }

        var targetElement = document.querySelector(targetId);

        if (targetElement) {
            // Offset by 80px to account for the fixed navbar
            var offsetTop = targetElement.offsetTop - 80;

            window.scrollTo({
                top: offsetTop,
                behavior: "smooth",
            });
        }
    });
});

// ============================================
// 2. Feature Card Highlighting
// ============================================

/**
 * When a user clicks a feature card, it gets a "highlighted" class
 * that makes it stand out. Clicking it again (or clicking another
 * card) removes the highlight. This is a simple way to let users
 * "select" a feature they're interested in.
 */
var featureCards = document.querySelectorAll(".feature-card");

featureCards.forEach(function (card) {
    card.addEventListener("click", function () {
        var isAlreadyHighlighted = this.classList.contains("highlighted");

        // Remove highlight from all cards first
        featureCards.forEach(function (otherCard) {
            otherCard.classList.remove("highlighted");
        });

        // If this card wasn't already highlighted, highlight it
        if (!isAlreadyHighlighted) {
            this.classList.add("highlighted");
        }
    });
});

// ============================================
// 3. Navbar Scroll Effect
// ============================================

/**
 * As the user scrolls down, the navbar gets a subtle shadow to
 * visually separate it from the content below. When scrolled
 * back to the top, the shadow disappears.
 */
var navbar = document.querySelector(".navbar");

window.addEventListener("scroll", function () {
    if (window.scrollY > 50) {
        navbar.style.boxShadow = "0 2px 20px rgba(0, 0, 0, 0.1)";
    } else {
        navbar.style.boxShadow = "none";
    }
});

// ============================================
// 4. Simple Scroll-Triggered Fade-In
// ============================================

/**
 * Elements with the class "feature-card" or "step" will gently
 * fade in as they enter the viewport. This uses the Intersection
 * Observer API, which is more performant than listening to the
 * scroll event for visibility checks.
 */
var animatedElements = document.querySelectorAll(".feature-card, .step");

// Set initial state: invisible and shifted down slightly
animatedElements.forEach(function (element) {
    element.style.opacity = "0";
    element.style.transform = "translateY(20px)";
    element.style.transition = "opacity 0.6s ease, transform 0.6s ease";
});

var observer = new IntersectionObserver(
    function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                // Stop observing once the animation has played
                observer.unobserve(entry.target);
            }
        });
    },
    {
        threshold: 0.15, // Trigger when 15% of the element is visible
    }
);

animatedElements.forEach(function (element) {
    observer.observe(element);
});
```

Let's walk through what this script does:

- **Smooth scrolling with offset** — The CSS `scroll-behavior: smooth` property handles basic smooth scrolling, but it doesn't know about your fixed navbar. When you click "Features" in the nav, the browser would scroll the "Features" heading right to the top of the screen — hidden behind the 80px-tall navbar. This JavaScript version subtracts 80 pixels so the heading lands just below the navbar.

- **Feature card highlighting** — Each feature card listens for a click event. When clicked, it receives the `.highlighted` CSS class (which you styled earlier with a border and shadow). Clicking the same card again removes the highlight. Clicking a different card moves the highlight. This toggle pattern is common in interactive UIs.

- **Navbar scroll shadow** — The `scroll` event listener checks `window.scrollY` (how far down the page you've scrolled). When you scroll past 50 pixels, a subtle shadow appears beneath the navbar. When you scroll back to the top, it disappears. This gives the navbar visual depth only when it needs it.

- **Intersection Observer fade-in** — This is the most advanced piece. The `IntersectionObserver` API watches elements and fires a callback when they enter (or leave) the viewport. You set each card and step to be invisible initially (`opacity: 0`), then fade them in (`opacity: 1`) when they scroll into view. The `threshold: 0.15` means the animation triggers when 15% of the element is visible. Once an element has animated in, `observer.unobserve()` stops watching it, so the animation plays only once.

Press **Ctrl+S** to save.

### 🔧 Tide Code Feature: Terminal

It's time to use the integrated terminal. Look at the bottom of the Tide Code window — you should see a terminal panel. If it's not visible, you can toggle it from the View menu, or use the keyboard shortcut (often **Ctrl+`** or **Ctrl+J**, depending on your configuration).

The terminal is a full shell — everything you can do in your system's terminal, you can do here. The working directory defaults to your workspace root (`taskflow/`).

### Previewing the Landing Page

Before committing your code, let's preview what you've built. In the terminal, type:

```bash
cd landing
```

You can open the HTML file directly in your browser. On Windows:

```bash
start index.html
```

On macOS:

```bash
open index.html
```

On Linux:

```bash
xdg-open index.html
```

Your browser should open and display the landing page. Scroll through it — you should see the hero section with the gradient text, the four feature cards (which fade in as you scroll), the three-step "How It Works" section, the purple CTA block, and the dark footer. Try clicking the navigation links to test smooth scrolling, and click the feature cards to see the highlight effect.

> 📖 **What just happened?** You built a complete, responsive landing page with pure HTML, CSS, and JavaScript — no frameworks, no dependencies. This page would work on any web server or even opened directly from the filesystem. It uses modern CSS features (gradients, grid, backdrop-filter) and modern JavaScript APIs (Intersection Observer) while remaining compatible with all current browsers.

### Initializing Git

Now let's put this project under version control. In the terminal, navigate back to the project root and initialize a git repository:

```bash
cd /path/to/taskflow
git init
```

Before your first commit, create a `.gitignore` file to tell Git which files to skip. Right-click on the project root in the file tree and create a new file called `.gitignore`:

```
# Python
__pycache__/
*.py[cod]
venv/
*.egg-info/
dist/
build/

# Node
node_modules/
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

Save it with **Ctrl+S**.

Now make your first commit in the terminal:

```bash
git add .
git commit -m "Initial commit: project structure, README, and landing page"
```

> 📖 **What just happened?** You initialized a Git repository, created a `.gitignore` to exclude generated files and dependencies, staged all your files with `git add .`, and created your first commit. Every commit is a snapshot of your project that you can return to if something goes wrong. Think of it as a save point in a video game.

### 🔧 Tide Code Feature: Git Workflow from Terminal

You just used Git entirely from the terminal. Tide Code's terminal supports all Git commands, and you'll see colored output for things like `git status`, `git diff`, and `git log`. In later chapters you'll learn about additional Git integrations, but the terminal is always available as your reliable fallback.

> 💡 **Tip:** Run `git log --oneline` after committing to see a compact history of your commits. Right now there's only one entry, but as the project grows, this becomes essential.

### Chapter 2 Recap

Here's what you've accomplished:

- **Built a complete landing page** with `index.html`, `styles.css`, and `script.js` — real code with gradients, animations, responsive design, and interactive features.
- **Practiced multi-tab editing** — switching between three related files.
- **Learned keyboard shortcuts** — Ctrl+S to save, Ctrl+Shift+P for the Command Palette, and more.
- **Used tab management** — reordering, closing, and organizing tabs.
- **Used the integrated terminal** — navigating directories, opening files in the browser, running Git commands.
- **Made your first Git commit** — initializing a repo, creating `.gitignore`, staging, and committing.

In the next chapter, you'll shift gears entirely — from static HTML to dynamic Python, building a REST API for TaskFlow.

---

## Chapter 3: The Python Backend

In this chapter, you'll build a complete REST API for TaskFlow using Python and FastAPI. By the end, you'll have a running server that can create, read, update, and delete tasks — all stored in a SQLite database. Along the way, you'll learn how to use split panes in Tide Code, manage multiple terminal tabs, and work across different programming languages in the same workspace.

### Setting Up the Python Environment

Click on the terminal panel at the bottom of Tide Code. You need to navigate to the `backend/` directory and set up an isolated Python environment.

```bash
cd backend
```

Now create a **virtual environment**. A virtual environment is an isolated copy of Python where you can install packages without affecting your system's global Python installation. This matters because different projects may need different versions of the same library.

```bash
python -m venv venv
```

> ⚠️ **Warning:** On some systems, the command is `python3` instead of `python`. If `python -m venv venv` gives you an error, try `python3 -m venv venv` instead. On Windows, you might also need to ensure Python is in your PATH.

This creates a `venv/` folder inside `backend/`. You'll notice it appear in the file tree — but don't worry, the `.gitignore` you created earlier already excludes it from Git.

Now activate the virtual environment:

**On Windows (Command Prompt or PowerShell in the Tide Code terminal):**

```bash
venv\Scripts\activate
```

**On Windows (Git Bash):**

```bash
source venv/Scripts/activate
```

**On macOS / Linux:**

```bash
source venv/bin/activate
```

You should see `(venv)` appear at the beginning of your terminal prompt. This confirms you're now working inside the virtual environment. Every `pip install` command you run will install packages into this isolated environment rather than your global Python.

Now install the dependencies:

```bash
pip install fastapi uvicorn
```

This installs two packages:

- **FastAPI** — A modern, high-performance web framework for building APIs in Python. It uses Python type hints to automatically validate request data and generate documentation.
- **Uvicorn** — An ASGI server that runs your FastAPI application. Think of it as the "engine" that listens for HTTP requests and routes them to your code.

### 🔧 Tide Code Feature: Split Panes

Before you start writing backend code, let's set up a more productive layout. Right now you're switching between the editor and the terminal by clicking. A better approach is to see both at once.

Tide Code supports **split panes** — you can divide the editor area to show multiple files (or views) simultaneously. But even more useful right now is the natural split between the **editor area** (top) and the **terminal** (bottom).

Try resizing the boundary between the editor and terminal:

1. Hover your cursor over the horizontal divider between the editor area and the terminal.
2. Your cursor will change to a resize cursor (↕).
3. Click and drag to adjust the proportions. Pull it up to give the terminal more room, or pull it down to maximize the editor.

For backend development, a roughly 60/40 split works well — enough editor space to see your code, enough terminal space to read server output.

> 💡 **Tip:** The optimal split depends on what you're doing. When writing code, give the editor more room. When debugging server logs, give the terminal more room. Adjust freely throughout your workflow.

### Building the Database Layer

You'll build the backend in three files, each with a clear responsibility:

1. **`database.py`** — Handles all SQLite operations (creating the table, inserting, querying, updating, deleting).
2. **`models.py`** — Defines the data shapes using Pydantic models (what a task looks like when created, updated, or returned).
3. **`main.py`** — The FastAPI application with all HTTP endpoints.

This separation is called **layered architecture**. It keeps your code organized: if you ever need to switch from SQLite to PostgreSQL, you'd only change `database.py` — the rest of the application wouldn't care.

Right-click on `backend/` in the file tree and create `database.py`. Add the following code:

```python
"""
database.py — SQLite database operations for TaskFlow.

This module handles all direct database interaction:
- Creating the todos table if it doesn't exist
- CRUD operations (Create, Read, Update, Delete)

We use Python's built-in sqlite3 module, so there are no extra
dependencies for the database layer.
"""

import sqlite3
from datetime import datetime
from typing import Optional


# Path to the SQLite database file. It will be created automatically
# in the backend/ directory when the application starts.
DATABASE_PATH = "taskflow.db"


def get_connection() -> sqlite3.Connection:
    """
    Create and return a connection to the SQLite database.

    Setting row_factory to sqlite3.Row allows us to access columns
    by name (row["title"]) instead of by index (row[0]), which makes
    the code much more readable.
    """
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database() -> None:
    """
    Create the todos table if it doesn't already exist.

    This function is safe to call multiple times — the IF NOT EXISTS
    clause means it won't fail or duplicate the table.

    Column explanations:
    - id: Auto-incrementing primary key. SQLite handles this automatically.
    - title: The task name. Required (NOT NULL).
    - description: Optional longer text about the task.
    - completed: Boolean stored as INTEGER (0 = false, 1 = true).
      SQLite doesn't have a native boolean type.
    - priority: One of 'low', 'medium', 'high'. Defaults to 'medium'.
    - category: Optional grouping label (e.g., "Work", "Personal").
    - due_date: Optional deadline, stored as a TEXT string in ISO format.
    - created_at: Timestamp when the task was created. Set automatically.
    - updated_at: Timestamp of the last modification. Updated on every change.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            completed INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'medium',
            category TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def create_todo(
    title: str,
    description: str = "",
    priority: str = "medium",
    category: str = "",
    due_date: str = "",
) -> dict:
    """
    Insert a new todo into the database and return it as a dictionary.

    The created_at and updated_at timestamps are set to the current
    UTC time automatically — the caller doesn't need to worry about them.
    """
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.utcnow().isoformat()

    cursor.execute(
        """
        INSERT INTO todos (title, description, priority, category, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (title, description, priority, category, due_date, now, now),
    )

    conn.commit()

    # Fetch the newly created row to return it
    todo_id = cursor.lastrowid
    todo = get_todo_by_id(todo_id, conn)

    conn.close()
    return todo


def get_all_todos() -> list[dict]:
    """
    Retrieve all todos from the database, ordered by creation date
    (newest first).

    Returns a list of dictionaries, one per todo.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM todos ORDER BY created_at DESC")
    rows = cursor.fetchall()

    # Convert sqlite3.Row objects to plain dictionaries
    todos = [dict(row) for row in rows]

    conn.close()
    return todos


def get_todo_by_id(todo_id: int, conn: Optional[sqlite3.Connection] = None) -> Optional[dict]:
    """
    Retrieve a single todo by its ID.

    Returns a dictionary if found, or None if no todo exists with that ID.

    The optional conn parameter allows reusing an existing connection
    (useful when called from create_todo to avoid opening a second connection).
    """
    should_close = conn is None
    if conn is None:
        conn = get_connection()

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
    row = cursor.fetchone()

    if should_close:
        conn.close()

    if row is None:
        return None
    return dict(row)


def update_todo(
    todo_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    completed: Optional[bool] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    due_date: Optional[str] = None,
) -> Optional[dict]:
    """
    Update an existing todo. Only the fields that are provided (not None)
    will be changed — all other fields remain as they are.

    This approach is called a "partial update" or "PATCH-style update."
    It's user-friendly because callers don't need to send the entire
    todo object just to change one field.

    Returns the updated todo as a dictionary, or None if the ID wasn't found.
    """
    # First, check that the todo exists
    existing = get_todo_by_id(todo_id)
    if existing is None:
        return None

    # Build the SET clause dynamically based on which fields were provided
    fields: list[str] = []
    values: list = []

    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if description is not None:
        fields.append("description = ?")
        values.append(description)
    if completed is not None:
        fields.append("completed = ?")
        values.append(1 if completed else 0)
    if priority is not None:
        fields.append("priority = ?")
        values.append(priority)
    if category is not None:
        fields.append("category = ?")
        values.append(category)
    if due_date is not None:
        fields.append("due_date = ?")
        values.append(due_date)

    # Always update the updated_at timestamp
    fields.append("updated_at = ?")
    values.append(datetime.utcnow().isoformat())

    # Add the todo ID for the WHERE clause
    values.append(todo_id)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        f"UPDATE todos SET {', '.join(fields)} WHERE id = ?",
        values,
    )

    conn.commit()

    # Fetch and return the updated record
    updated = get_todo_by_id(todo_id, conn)
    conn.close()
    return updated


def delete_todo(todo_id: int) -> bool:
    """
    Delete a todo by its ID.

    Returns True if a row was deleted, False if no todo existed with that ID.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    conn.commit()

    # rowcount tells us how many rows were affected by the DELETE
    deleted = cursor.rowcount > 0

    conn.close()
    return deleted
```

This is the most code-heavy file in the backend. Let's make sure you understand every piece:

- **`get_connection()`** — Each function opens its own database connection and closes it when done. For a small application like this, that's perfectly fine. The `row_factory = sqlite3.Row` setting is crucial — without it, SQLite returns tuples like `(1, "Buy groceries", "", 0, "medium", ...)` and you'd have to remember which index is which. With `Row`, you can use `row["title"]` instead.

- **`initialize_database()`** — Called once when the server starts. The `CREATE TABLE IF NOT EXISTS` statement ensures the table is created the first time and silently skipped on subsequent runs. SQLite stores booleans as integers (0 and 1), which is why `completed` is `INTEGER DEFAULT 0` rather than `BOOLEAN DEFAULT FALSE`.

- **`create_todo()`** — Uses parameterized queries (`?` placeholders) instead of string concatenation. This prevents SQL injection attacks. The `cursor.lastrowid` property gives you the auto-generated ID of the row that was just inserted.

- **`get_all_todos()`** — Fetches every row, converts each `sqlite3.Row` to a plain `dict` (which FastAPI can serialize to JSON), and returns them sorted by creation date.

- **`get_todo_by_id()`** — Accepts an optional connection parameter so it can be called from `create_todo()` without opening a second connection to the same database. This is a small but important design detail.

- **`update_todo()`** — Builds the SQL `UPDATE` statement dynamically. If you only pass `completed=True`, it only updates that one column (plus `updated_at`). The other columns are untouched. This is much more flexible than requiring the caller to send every field.

- **`delete_todo()`** — Returns a boolean so the API layer can tell the difference between "successfully deleted" and "nothing to delete."

Press **Ctrl+S** to save.

### Building the Models

Now create `models.py` in the `backend/` folder. Pydantic models define the "shape" of your data — what fields exist, what types they have, and what's optional. FastAPI uses these models to validate incoming request data and format outgoing response data automatically.

```python
"""
models.py — Pydantic data models for TaskFlow.

These models serve three purposes:
1. Validate incoming request data (reject invalid input automatically)
2. Serialize outgoing response data (convert Python objects to JSON)
3. Generate API documentation (FastAPI reads these to build docs)
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Priority(str, Enum):
    """
    Task priority levels.

    By inheriting from both str and Enum, each value is both a string
    and an enum member. This means FastAPI can serialize it as a plain
    string in JSON ("low") while still providing enum validation —
    if someone sends priority="critical", it will be rejected.
    """

    low = "low"
    medium = "medium"
    high = "high"


class TodoCreate(BaseModel):
    """
    Schema for creating a new todo.

    Only 'title' is required. Everything else has sensible defaults.
    The Field() function lets us add validation rules and documentation.
    """

    title: str = Field(
        ...,  # ... means this field is required
        min_length=1,
        max_length=200,
        description="The task title. Must be between 1 and 200 characters.",
    )
    description: str = Field(
        default="",
        max_length=1000,
        description="An optional longer description of the task.",
    )
    priority: Priority = Field(
        default=Priority.medium,
        description="Task priority: low, medium, or high.",
    )
    category: str = Field(
        default="",
        max_length=100,
        description="An optional category label (e.g., 'Work', 'Personal').",
    )
    due_date: str = Field(
        default="",
        description="Optional due date in ISO 8601 format (e.g., '2026-04-15').",
    )


class TodoUpdate(BaseModel):
    """
    Schema for updating an existing todo.

    Every field is optional — you only send the fields you want to change.
    Fields that are not included in the request body will remain unchanged.
    """

    title: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Updated task title.",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Updated task description.",
    )
    completed: Optional[bool] = Field(
        default=None,
        description="Whether the task is completed.",
    )
    priority: Optional[Priority] = Field(
        default=None,
        description="Updated priority: low, medium, or high.",
    )
    category: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Updated category label.",
    )
    due_date: Optional[str] = Field(
        default=None,
        description="Updated due date in ISO 8601 format.",
    )


class TodoResponse(BaseModel):
    """
    Schema for returning a todo in API responses.

    This includes all fields, including the auto-generated ones
    (id, created_at, updated_at) that the user never sends but
    always receives.
    """

    id: int
    title: str
    description: str
    completed: bool
    priority: Priority
    category: str
    due_date: str
    created_at: str
    updated_at: str
```

Let's unpack the design decisions:

- **`Priority(str, Enum)`** — This is a Python enum that doubles as a string. The `str` mixin is important: without it, FastAPI would serialize the priority as `Priority.medium` instead of just `"medium"` in JSON responses. The enum restricts values to exactly three options. If a client sends `priority: "critical"`, FastAPI will automatically return a 422 error with a clear message.

- **`TodoCreate` vs. `TodoUpdate`** — These are two separate models for the same resource. In `TodoCreate`, `title` is required (indicated by `...`) because you can't create a task without a name. In `TodoUpdate`, every field is `Optional` and defaults to `None`, because an update might only change one field.

- **`Field()` with validation** — `min_length=1` on the title ensures empty strings are rejected. `max_length=200` prevents absurdly long titles. These constraints are enforced automatically by FastAPI before your code even runs.

- **`TodoResponse`** — This model includes `id`, `created_at`, and `updated_at` — fields that exist in the database but shouldn't be sent by the client. By using a separate response model, you make it explicit what the API returns.

Press **Ctrl+S** to save.

### 🔧 Tide Code Feature: Multi-Language Editing

You now have Python files (`.py`) open alongside your HTML, CSS, and JavaScript files from Chapter 2. Click between the tabs and notice how the syntax highlighting changes to match each language. The Monaco editor detects the language from the file extension and applies the correct grammar:

- Python gets highlights for `def`, `class`, `import`, decorators (`@`), and f-strings.
- HTML gets highlights for tags, attributes, and entities.
- CSS gets highlights for selectors, properties, and values.
- JavaScript gets highlights for `function`, `const`, `var`, arrow functions, and template literals.

This seamless switching between languages is essential for full-stack development. You're already working across four languages in one workspace.

### Building the API

Now for the main event. Create `main.py` in the `backend/` folder:

```python
"""
main.py — FastAPI application for TaskFlow.

This is the entry point of the backend. It defines all HTTP endpoints
and wires them to the database layer. FastAPI handles:
- Routing (which function handles which URL)
- Request validation (using the Pydantic models)
- Response serialization (converting Python dicts to JSON)
- Error handling (returning proper HTTP status codes)
- API documentation (auto-generated at /docs)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database import initialize_database, create_todo, get_all_todos, get_todo_by_id, update_todo, delete_todo
from models import TodoCreate, TodoUpdate, TodoResponse


# Create the FastAPI application instance.
# The metadata (title, description, version) appears in the auto-generated docs.
app = FastAPI(
    title="TaskFlow API",
    description="A REST API for managing tasks with priorities, categories, and due dates.",
    version="1.0.0",
)


# ============================================
# CORS Configuration
# ============================================

# CORS (Cross-Origin Resource Sharing) controls which websites can make
# requests to your API. Without this, your React frontend (running on
# localhost:5173) would be blocked by the browser from calling your API
# (running on localhost:8000).
#
# In production, you'd restrict this to your actual domain. During
# development, we allow localhost on common ports.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server (React frontend)
        "http://localhost:3000",  # Alternative dev server port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, PUT, DELETE)
    allow_headers=["*"],  # Allow all headers
)


# ============================================
# Startup Event
# ============================================

@app.on_event("startup")
def on_startup() -> None:
    """
    This function runs once when the server starts. It ensures the
    database table exists before any requests come in.
    """
    initialize_database()
    print("Database initialized. TaskFlow API is ready.")


# ============================================
# Health Check
# ============================================

@app.get("/", tags=["Health"])
def health_check() -> dict:
    """
    A simple endpoint to verify the API is running.
    Useful for monitoring tools and quick manual checks.
    """
    return {"status": "ok", "message": "TaskFlow API is running."}


# ============================================
# Todo Endpoints
# ============================================

@app.get("/todos", response_model=list[TodoResponse], tags=["Todos"])
def list_todos() -> list[dict]:
    """
    Retrieve all todos.

    Returns a list of all tasks in the database, ordered by creation
    date (newest first). The response_model parameter tells FastAPI
    to validate and format the output using the TodoResponse schema.
    """
    return get_all_todos()


@app.post("/todos", response_model=TodoResponse, status_code=201, tags=["Todos"])
def create_new_todo(todo: TodoCreate) -> dict:
    """
    Create a new todo.

    The request body must match the TodoCreate schema. FastAPI
    automatically validates the input — if 'title' is missing or
    'priority' has an invalid value, the client receives a 422 error
    with a detailed explanation.

    The 201 status code means "Created" — the standard response
    when a new resource is successfully added.
    """
    return create_todo(
        title=todo.title,
        description=todo.description,
        priority=todo.priority.value,
        category=todo.category,
        due_date=todo.due_date,
    )


@app.get("/todos/{todo_id}", response_model=TodoResponse, tags=["Todos"])
def get_single_todo(todo_id: int) -> dict:
    """
    Retrieve a single todo by its ID.

    The {todo_id} in the URL is a "path parameter." FastAPI extracts
    it from the URL and converts it to an integer automatically. If
    someone requests /todos/abc, they get a 422 error because "abc"
    isn't a valid integer.

    If no todo exists with the given ID, we raise a 404 error.
    """
    todo = get_todo_by_id(todo_id)
    if todo is None:
        raise HTTPException(
            status_code=404,
            detail=f"Todo with id {todo_id} not found.",
        )
    return todo


@app.put("/todos/{todo_id}", response_model=TodoResponse, tags=["Todos"])
def update_existing_todo(todo_id: int, updates: TodoUpdate) -> dict:
    """
    Update an existing todo.

    Only the fields included in the request body will be changed.
    Omitted fields remain as they are. For example, sending just
    {"completed": true} will mark the task as done without changing
    its title, description, or any other field.

    Returns the full updated todo, or 404 if the ID doesn't exist.
    """
    updated = update_todo(
        todo_id=todo_id,
        title=updates.title,
        description=updates.description,
        completed=updates.completed,
        priority=updates.priority.value if updates.priority else None,
        category=updates.category,
        due_date=updates.due_date,
    )
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Todo with id {todo_id} not found.",
        )
    return updated


@app.delete("/todos/{todo_id}", tags=["Todos"])
def delete_existing_todo(todo_id: int) -> dict:
    """
    Delete a todo by its ID.

    Returns a confirmation message if the todo was deleted, or 404
    if no todo existed with that ID.

    Note: We don't use response_model here because the response
    shape (a simple message) doesn't match TodoResponse.
    """
    success = delete_todo(todo_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Todo with id {todo_id} not found.",
        )
    return {"message": f"Todo {todo_id} deleted successfully."}
```

This file ties everything together. Here's what each section does:

- **FastAPI app instance** — `FastAPI()` creates your application. The `title`, `description`, and `version` metadata power the auto-generated documentation at `/docs`.

- **CORS middleware** — Without CORS configuration, your browser would refuse to let the React frontend (running on `localhost:5173`) call your API (running on `localhost:8000`). This is a browser security feature called the Same-Origin Policy. The CORS middleware explicitly tells browsers: "Yes, these specific origins are allowed to talk to me."

- **Startup event** — `@app.on_event("startup")` registers a function that runs once when the server boots. You use it to initialize the database. This means you never have to run a separate setup script — starting the server is the only step.

- **Health check** — The `GET /` endpoint returns a simple JSON object. It exists so you (and monitoring tools) can quickly check whether the API is alive without hitting a "real" endpoint.

- **CRUD endpoints** — These follow REST conventions:
  
  - `GET /todos` — List all tasks
  - `POST /todos` — Create a new task
  - `GET /todos/{id}` — Get one task by ID
  - `PUT /todos/{id}` — Update a task
  - `DELETE /todos/{id}` — Delete a task

- **`response_model`** — This parameter tells FastAPI to validate the response data against your Pydantic model before sending it. If your database returns a field with the wrong type, FastAPI catches it instead of sending broken JSON to the client.

- **`HTTPException`** — When a todo isn't found, you raise a 404 error. FastAPI catches this exception and returns a proper JSON error response like `{"detail": "Todo with id 99 not found."}`.

- **`status_code=201`** — The POST endpoint returns 201 (Created) instead of the default 200 (OK). This follows HTTP conventions — 201 specifically means "a new resource was created."

Press **Ctrl+S** to save.

### Running the Server

Now comes the exciting part — starting your API. Make sure you're in the `backend/` directory with the virtual environment activated, then run:

```bash
uvicorn main:app --reload
```

Let's break down this command:

- **`uvicorn`** — The ASGI server that runs your app.
- **`main:app`** — Tells uvicorn to look in `main.py` for the object called `app`.
- **`--reload`** — Watches your Python files for changes and automatically restarts the server. Essential during development.

You should see output like:

```
INFO:     Will watch for changes in these directories: ['/path/to/taskflow/backend']
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345]
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
Database initialized. TaskFlow API is ready.
INFO:     Application startup complete.
```

Your API is now running. But there's a problem — your terminal is occupied by the running server. You can't type any other commands in it.

### 🔧 Tide Code Feature: Multiple Terminal Tabs

This is where **multiple terminal tabs** come in. Look at the terminal panel — you should see a tab for your current terminal session (the one running the server). Next to it, there's a **+** button (or you can right-click the tab area) to create a new terminal tab.

Click the **+** button to open a second terminal tab. This gives you a fresh shell while the server continues running in the first tab. You can switch between terminal tabs by clicking them, just like editor tabs.

> 💡 **Tip:** Name your terminal tabs to keep track of them. In many configurations, you can right-click a terminal tab and rename it. Consider naming them "Server" and "Testing" so you always know which is which.

In your new terminal tab, navigate to the backend directory and activate the virtual environment again (each terminal session needs its own activation):

```bash
cd backend
source venv/Scripts/activate  # Adjust for your OS as shown earlier
```

### Testing with curl

Now let's verify everything works. In the second terminal tab, run these commands one at a time:

**1. Check the health endpoint:**

```bash
curl http://127.0.0.1:8000/
```

Expected response:

```json
{"status":"ok","message":"TaskFlow API is running."}
```

**2. Create a todo:**

```bash
curl -X POST http://127.0.0.1:8000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn FastAPI", "description": "Build a REST API with Python", "priority": "high", "category": "Learning"}'
```

Expected response (your timestamps and ID will differ):

```json
{
  "id": 1,
  "title": "Learn FastAPI",
  "description": "Build a REST API with Python",
  "completed": false,
  "priority": "high",
  "category": "Learning",
  "due_date": "",
  "created_at": "2026-03-18T14:30:00.000000",
  "updated_at": "2026-03-18T14:30:00.000000"
}
```

**3. Create a second todo:**

```bash
curl -X POST http://127.0.0.1:8000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Build React frontend", "priority": "medium", "category": "Work", "due_date": "2026-04-01"}'
```

**4. List all todos:**

```bash
curl http://127.0.0.1:8000/todos
```

You should see an array with both todos.

**5. Update a todo (mark as completed):**

```bash
curl -X PUT http://127.0.0.1:8000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

Notice that the response shows `"completed": true` and an updated `updated_at` timestamp, while all other fields remain unchanged.

**6. Delete a todo:**

```bash
curl -X DELETE http://127.0.0.1:8000/todos/2
```

Expected response:

```json
{"message":"Todo 2 deleted successfully."}
```

**7. Try to get the deleted todo:**

```bash
curl http://127.0.0.1:8000/todos/2
```

Expected response:

```json
{"detail":"Todo with id 2 not found."}
```

> 📖 **What just happened?** You tested every endpoint of your API using `curl`, a command-line tool for making HTTP requests. Each endpoint behaved exactly as designed: the POST endpoint created resources and returned 201, the GET endpoints returned data, the PUT endpoint partially updated a resource, and the DELETE endpoint removed a resource and returned a confirmation. When you tried to access a deleted resource, the API correctly returned a 404 error.

> 💡 **Tip:** FastAPI also auto-generates interactive API documentation. Open your browser and navigate to `http://127.0.0.1:8000/docs`. You'll see a Swagger UI page where you can test every endpoint directly from the browser — no curl needed. There's also a ReDoc version at `http://127.0.0.1:8000/redoc`.

### Committing the Backend

Switch to your testing terminal tab (the one not running the server). Navigate to the project root and commit your backend code:

```bash
cd /path/to/taskflow
git add backend/database.py backend/models.py backend/main.py
git status
```

Review the output of `git status` to confirm you're committing exactly the right files. You should see three new files staged. The `venv/` directory and `taskflow.db` should not be staged (they're excluded by `.gitignore`).

> ⚠️ **Warning:** Never commit your `venv/` directory or database files. The virtual environment contains hundreds of megabytes of binary files specific to your machine, and the database file changes with every request. Your `.gitignore` already handles this, but it's good practice to review `git status` before every commit.

Now commit:

```bash
git commit -m "Add Python backend: FastAPI with SQLite, full CRUD API for todos"
```

You can verify with:

```bash
git log --oneline
```

You should see two commits — your initial commit from Chapter 2 and this new backend commit.

### Chapter 3 Recap

Here's what you've accomplished:

- **Set up a Python environment** — Created a virtual environment, activated it, and installed FastAPI and Uvicorn.
- **Built a database layer** (`database.py`) — SQLite table creation and CRUD functions using parameterized queries.
- **Defined data models** (`models.py`) — Pydantic schemas with validation, an enum for priorities, and separate models for create, update, and response.
- **Created a REST API** (`main.py`) — Five endpoints following REST conventions, CORS configuration for the React frontend, automatic documentation, and proper error handling.
- **Ran the server** — Started Uvicorn with auto-reload and tested every endpoint with curl.
- **Used split panes** — Editor above, terminal below, resizing to match your workflow.
- **Managed multiple terminal tabs** — One for the running server, one for testing.
- **Worked across languages** — Switched between Python, HTML, CSS, and JavaScript files in the same workspace.
- **Made another Git commit** — Staged specific files and committed with a descriptive message.

In the next chapter, you'll scaffold the React frontend with Vite and start connecting it to this API.

## Chapter 4: The React Frontend

Now that your backend is humming along and serving data on `localhost:8000`, it's time to build the interface your users will actually see. In this chapter, you'll scaffold a React + TypeScript frontend using Vite, build out a complete set of components, and style everything with a dark theme that feels right at home next to Tide Code's own aesthetic.

By the end of this chapter, you'll have a fully rendered todo application in the browser — it won't talk to the backend yet (that's Chapter 6), but every component will be wired up and ready.

### Setting Up the Vite Project

Open a new terminal tab in Tide Code. You already have one running your FastAPI server — leave it running. Click the **+** icon in the terminal panel or press `Ctrl+Shift+`` to open a fresh tab.

Navigate to your project root:

```bash
cd taskflow
```

Now scaffold the React project with Vite. We're using the `react-ts` template because TypeScript will catch entire categories of bugs before they ever reach the browser:

```bash
npm create vite@latest frontend -- --template react-ts
```

If a `frontend/` directory already exists from Chapter 1's scaffolding, Vite will ask you to confirm. Choose the option to overwrite or remove the old directory first. Then install dependencies:

```bash
cd frontend && npm install
```

> 📖 **What just happened?** Vite created a complete React + TypeScript project with hot module replacement (HMR), meaning every time you save a file, the browser updates instantly without a full page reload. This tight feedback loop is one of the reasons Vite has become the default choice for new React projects.

### 🔧 Tide Code Feature: File Tree Navigation

With three subdirectories now — `landing/`, `backend/`, and `frontend/` — your project is starting to look like a real full-stack application. Look at the **File Explorer** panel on the left side of Tide Code.

You can collapse and expand directories by clicking the arrow next to each folder name. Try collapsing `landing/` and `backend/` for now so you can focus on `frontend/`. You can also:

- **Single-click** a file to preview it (the tab title will be in *italics*, meaning it's a preview and will be replaced when you click another file)
- **Double-click** a file to open it permanently in a tab
- **Right-click** a directory to create new files or folders directly from the tree

### 🔧 Tide Code Feature: File Type Icons

Notice how different file types get different icons in the file tree and in editor tabs. You'll see distinct icons for `.tsx` (React components), `.ts` (plain TypeScript), `.css` (styles), `.py` (Python), and `.html` files. This isn't just cosmetic — when you're jumping between a dozen open files, those icons help you find the right tab instantly. A quick glance at the tab bar tells you whether you're looking at a component, a stylesheet, or a backend file.

### Defining TypeScript Types

Your backend already defines a data contract through its Pydantic models. Now you need to mirror that contract on the frontend so TypeScript can enforce it at compile time. Create a new file at `frontend/src/types.ts`:

```typescript
// frontend/src/types.ts
// TypeScript interfaces that mirror the backend's Pydantic models.
// Keeping these in sync ensures the frontend and backend agree on
// the shape of every piece of data that crosses the network.

export enum Priority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  priority: Priority;
  category: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoCreate {
  title: string;
  description?: string | null;
  priority?: Priority;
  category?: string | null;
  due_date?: string | null;
}

export interface TodoUpdate {
  title?: string;
  description?: string | null;
  completed?: boolean;
  priority?: Priority;
  category?: string | null;
  due_date?: string | null;
}
```

> 📖 **What just happened?** You created a single source of truth for your frontend's type system. Every component that touches a todo will import from this file. If the backend adds a field, you update it here once, and TypeScript will flag every place that needs to handle the new data.

### Building the API Client

Next, create the API client that wraps all your `fetch` calls. This centralizes your network logic so components never construct URLs or parse responses directly. Create `frontend/src/api.ts`:

```typescript
// frontend/src/api.ts
// Centralized API client. Every network call goes through here,
// making it trivial to change the base URL, add auth headers,
// or swap in a different HTTP library later.

import { Todo, TodoCreate, TodoUpdate } from "./types";

const API_BASE = "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }
  return response.json();
}

export async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch(`${API_BASE}/todos`);
  return handleResponse<Todo[]>(response);
}

export async function createTodo(todo: TodoCreate): Promise<Todo> {
  const response = await fetch(`${API_BASE}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(todo),
  });
  return handleResponse<Todo>(response);
}

export async function updateTodo(
  id: number,
  todo: TodoUpdate
): Promise<Todo> {
  const response = await fetch(`${API_BASE}/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(todo),
  });
  return handleResponse<Todo>(response);
}

export async function deleteTodo(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/todos/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }
}
```

The `handleResponse` helper is a small pattern that pays for itself immediately. Instead of checking `response.ok` in every component, you do it once. If the backend returns a 422 validation error or a 500 server error, it throws with a meaningful message.

### 🔧 Tide Code Feature: Multi-Language Context Switching

Here's something worth pausing on. You now have `types.ts` open alongside `models.py` from the backend. These two files define the same data structures in two different languages. In Tide Code, you can place them side by side — right-click a tab and choose **Split Right** — to visually confirm they match.

Your brain is doing something genuinely useful here: switching between Python's type hints and TypeScript's interfaces, noticing where `Optional[str]` maps to `string | null`, where Python's `str` enum becomes TypeScript's `enum`. Tide Code's syntax highlighting adapts per file, so each language gets its own color scheme tuned for readability.

### Building the TodoItem Component

Create the `components` directory and the first component. In the file tree, right-click `frontend/src/`, select **New Folder**, and name it `components`. Then create `frontend/src/components/TodoItem.tsx`:

```tsx
// frontend/src/components/TodoItem.tsx
// Renders a single todo as a card. Handles toggling completion
// and deleting, delegating the actual API calls to parent callbacks.

import { Todo } from "../types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const priorityLabel = todo.priority.charAt(0).toUpperCase() + todo.priority.slice(1);

  return (
    <div className={`todo-item ${todo.completed ? "completed" : ""}`}>
      <div className="todo-item-left">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id, !todo.completed)}
          className="todo-checkbox"
          aria-label={`Mark "${todo.title}" as ${todo.completed ? "incomplete" : "complete"}`}
        />
        <div className="todo-content">
          <h3 className="todo-title">{todo.title}</h3>
          {todo.description && (
            <p className="todo-description">{todo.description}</p>
          )}
          <div className="todo-meta">
            <span className={`priority-badge priority-${todo.priority}`}>
              {priorityLabel}
            </span>
            {todo.category && (
              <span className="category-tag">{todo.category}</span>
            )}
            {todo.due_date && (
              <span className="due-date">
                Due: {new Date(todo.due_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        className="delete-btn"
        onClick={() => onDelete(todo.id)}
        aria-label={`Delete "${todo.title}"`}
      >
        ×
      </button>
    </div>
  );
}

export default TodoItem;
```

Notice the component doesn't call the API directly. It receives `onToggle` and `onDelete` as props — callbacks that the parent component controls. This is a deliberate design choice: it keeps `TodoItem` a "dumb" presentational component, making it easy to test and reuse.

### 🔧 Tide Code Feature: Bracket Matching and Auto-Indent

As you type JSX, watch how Tide Code automatically matches your brackets. When your cursor sits on an opening `{`, the matching closing `}` highlights. This is essential in React where you're constantly nesting curly braces inside angle brackets inside parentheses.

Auto-indent kicks in too — when you press Enter after an opening tag like `<div className="todo-item">`, the cursor indents to the correct level. You don't need to count spaces manually.

### Building the TodoList Component

Create `frontend/src/components/TodoList.tsx`:

```tsx
// frontend/src/components/TodoList.tsx
// Renders the full list of todos, or a friendly empty state
// message when there's nothing to show yet.

import { Todo } from "../types";
import TodoItem from "./TodoItem";

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
}

function TodoList({ todos, onToggle, onDelete }: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">&#9745;</div>
        <h3>No tasks yet</h3>
        <p>Add your first task above to get started.</p>
      </div>
    );
  }

  return (
    <div className="todo-list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default TodoList;
```

The empty state matters more than you might think. A blank screen when there are no todos is confusing — users don't know if the app is broken or just empty. The friendly message with a checkbox icon makes it clear: everything works, you just haven't added anything yet.

### Building the AddTodo Form

Create `frontend/src/components/AddTodo.tsx`:

```tsx
// frontend/src/components/AddTodo.tsx
// A controlled form for creating new todos. Uses local state
// for form fields and resets after successful submission.

import { useState } from "react";
import { TodoCreate, Priority } from "../types";

interface AddTodoProps {
  onAdd: (todo: TodoCreate) => void;
}

function AddTodo({ onAdd }: AddTodoProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAdd({
      title: title.trim(),
      description: description.trim() || null,
      priority,
    });

    setTitle("");
    setDescription("");
    setPriority(Priority.MEDIUM);
    setIsExpanded(false);
  };

  return (
    <form className="add-todo-form" onSubmit={handleSubmit}>
      <div className="form-main-row">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="todo-input"
          aria-label="Task title"
        />
        <button type="submit" className="add-btn" disabled={!title.trim()}>
          Add Task
        </button>
      </div>

      <button
        type="button"
        className="expand-btn"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? "Less options" : "More options"}
      </button>

      {isExpanded && (
        <div className="form-details">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="todo-textarea"
            rows={3}
            aria-label="Task description"
          />
          <div className="form-row">
            <label htmlFor="priority-select">Priority:</label>
            <select
              id="priority-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="priority-select"
            >
              <option value={Priority.LOW}>Low</option>
              <option value={Priority.MEDIUM}>Medium</option>
              <option value={Priority.HIGH}>High</option>
            </select>
          </div>
        </div>
      )}
    </form>
  );
}

export default AddTodo;
```

The `isExpanded` toggle is a UX decision: most of the time, users just want to type a title and hit Enter. The description and priority fields are there when needed but hidden by default so the interface stays clean.

### 🔧 Tide Code Feature: Multiple Cursors

Here's a productivity trick you'll use constantly. Say you want to rename `todo` to `task` in several places within a file. Place your cursor on the word `todo`, then press **Ctrl+D** repeatedly. Each press selects the next occurrence of the same word, adding a new cursor. Once you've selected all the instances you want to change, just type the replacement — all cursors update simultaneously.

Try it now: open `TodoItem.tsx`, click on one instance of `todo-item` in the className strings, and press **Ctrl+D** a few times to see how multi-cursor selection works. Press **Escape** when you're done to return to a single cursor. (Don't actually rename anything — we like the names as they are.)

### Orchestrating Everything in App.tsx

Now replace the contents of `frontend/src/App.tsx` with the main application component that ties everything together:

```tsx
// frontend/src/App.tsx
// The root component. Manages the global todo list state,
// handles all API interactions, and renders the page layout.

import { useState, useEffect } from "react";
import { Todo, TodoCreate } from "./types";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "./api";
import TodoList from "./components/TodoList";
import AddTodo from "./components/AddTodo";
import "./App.css";

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = async () => {
    try {
      setError(null);
      const data = await fetchTodos();
      setTodos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load todos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const handleAdd = async (newTodo: TodoCreate) => {
    try {
      setError(null);
      const created = await createTodo(newTodo);
      setTodos((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create todo");
    }
  };

  const handleToggle = async (id: number, completed: boolean) => {
    try {
      setError(null);
      const updated = await updateTodo(id, { completed });
      setTodos((prev) =>
        prev.map((todo) => (todo.id === id ? updated : todo))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update todo");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      setError(null);
      await deleteTodo(id);
      setTodos((prev) => prev.filter((todo) => todo.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete todo");
    }
  };

  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>TaskFlow</h1>
        <p className="app-subtitle">
          {todos.length > 0
            ? `${completedCount} of ${todos.length} tasks completed`
            : "Your personal task manager"}
        </p>
      </header>

      <main className="app-main">
        <AddTodo onAdd={handleAdd} />

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading tasks...</div>
        ) : (
          <TodoList
            todos={todos}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Built with Tide Code</p>
      </footer>
    </div>
  );
}

export default App;
```

> 📖 **What just happened?** `App.tsx` is the command center. It owns the `todos` state array and passes down callback functions (`handleAdd`, `handleToggle`, `handleDelete`) to child components. When any child triggers an action, the state updates here and React re-renders the affected parts of the UI. This is called "lifting state up" — the standard React pattern for sharing state between sibling components.

Notice the optimistic-looking error handling: each handler catches errors and displays them in a banner rather than crashing the app. The `loading` state prevents a flash of "No tasks yet" before the data arrives.

### Styling the Application

Replace `frontend/src/App.css` with a dark theme that complements Tide Code's interface:

```css
/* frontend/src/App.css */
/* Dark-themed styles for TaskFlow. The color palette is chosen
   to feel native alongside Tide Code's own dark UI. */

.app {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.app-header h1 {
  font-size: 2.25rem;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
}

.app-subtitle {
  color: #94a3b8;
  font-size: 0.95rem;
  margin-top: 0.4rem;
}

.app-main {
  flex: 1;
}

/* --- Add Todo Form --- */
.add-todo-form {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.form-main-row {
  display: flex;
  gap: 0.75rem;
}

.todo-input {
  flex: 1;
  padding: 0.7rem 1rem;
  border: 1px solid #475569;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.todo-input:focus {
  border-color: #60a5fa;
}

.todo-input::placeholder {
  color: #64748b;
}

.add-btn {
  padding: 0.7rem 1.25rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.add-btn:hover:not(:disabled) {
  background: #2563eb;
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.expand-btn {
  background: none;
  border: none;
  color: #60a5fa;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.5rem 0;
  margin-top: 0.25rem;
}

.expand-btn:hover {
  text-decoration: underline;
}

.form-details {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.todo-textarea {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid #475569;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 0.9rem;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.todo-textarea:focus {
  border-color: #60a5fa;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.form-row label {
  color: #94a3b8;
  font-size: 0.9rem;
}

.priority-select {
  padding: 0.4rem 0.75rem;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
}

/* --- Todo List --- */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  transition: border-color 0.2s, opacity 0.3s;
}

.todo-item.completed {
  opacity: 0.55;
}

.todo-item:hover {
  border-color: #475569;
}

.todo-item-left {
  display: flex;
  gap: 0.85rem;
  flex: 1;
  min-width: 0;
}

.todo-checkbox {
  margin-top: 0.25rem;
  width: 18px;
  height: 18px;
  accent-color: #3b82f6;
  cursor: pointer;
  flex-shrink: 0;
}

.todo-content {
  flex: 1;
  min-width: 0;
}

.todo-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
  word-break: break-word;
}

.completed .todo-title {
  text-decoration: line-through;
  color: #64748b;
}

.todo-description {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0.3rem 0 0;
  word-break: break-word;
}

.todo-meta {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.priority-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.priority-low {
  background: #064e3b;
  color: #6ee7b7;
}

.priority-medium {
  background: #713f12;
  color: #fcd34d;
}

.priority-high {
  background: #7f1d1d;
  color: #fca5a5;
}

.category-tag {
  font-size: 0.75rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: #1e3a5f;
  color: #93c5fd;
}

.due-date {
  font-size: 0.75rem;
  color: #94a3b8;
}

.delete-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.2s;
  flex-shrink: 0;
}

.delete-btn:hover {
  color: #ef4444;
}

/* --- Empty State --- */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #64748b;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  opacity: 0.4;
}

.empty-state h3 {
  color: #94a3b8;
  margin: 0 0 0.4rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.9rem;
}

/* --- Error Banner --- */
.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #7f1d1d;
  color: #fecaca;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.error-banner button {
  background: none;
  border: none;
  color: #fecaca;
  font-size: 1.25rem;
  cursor: pointer;
}

/* --- Loading --- */
.loading {
  text-align: center;
  color: #64748b;
  padding: 2rem;
  font-size: 0.95rem;
}

/* --- Footer --- */
.app-footer {
  text-align: center;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid #1e293b;
}

.app-footer p {
  color: #475569;
  font-size: 0.8rem;
  margin: 0;
}
```

Now replace `frontend/src/index.css` with global resets and base styles:

```css
/* frontend/src/index.css */
/* Global resets and base styles. Sets the dark background
   and default typography for the entire application. */

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
    Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #0f172a;
  color: #e2e8f0;
  line-height: 1.6;
}

a {
  color: #60a5fa;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

::selection {
  background: #3b82f6;
  color: #fff;
}

input,
textarea,
select,
button {
  font-family: inherit;
}
```

### Running the Dev Server

Time to see it in the browser. In your terminal (make sure you're in the `frontend/` directory):

```bash
npm run dev
```

Vite will start and display a URL, typically `http://localhost:5173`. Open that URL in your browser.

You should see the TaskFlow header, the "What needs to be done?" input field, and the empty state message below it. The dark theme should look clean and professional. Try typing a task title — the "Add Task" button enables when you type. Click "More options" to reveal the description and priority fields.

> **Warning:** If you try to add a task right now, you'll see an error banner. That's expected — the frontend is trying to reach `localhost:8000`, but we haven't connected the two yet. The UI itself is working correctly; the network calls will succeed once we connect everything in Chapter 6.

> **Tip:** Keep the Vite dev server running. Thanks to HMR, any changes you save to your React components or CSS files will appear in the browser almost instantly. You won't need to manually refresh.

### Committing Your Frontend

Open the terminal and commit your progress:

```bash
cd taskflow
git add frontend/
git commit -m "Add React frontend with TypeScript components and dark theme"
```

You now have a complete frontend with type-safe data models, a centralized API client, three focused components, and a polished dark interface. In the next chapter, you'll meet the most powerful feature of Tide Code — the AI agent.

---

## Chapter 5: Talking to the AI Agent

Everything you've built so far, you've typed by hand. That was intentional — you need to understand your own codebase before you can direct an AI to modify it. But now it's time to meet **Pi**, Tide Code's built-in AI agent. This isn't autocomplete. This isn't a chatbot that gives you generic advice. Pi can read your files, write code directly into your project, and execute terminal commands — all with your approval.

This chapter will change how you think about coding.

### Opening the Agent Panel

Look at the right side of the Tide Code window. You should see the **Agent Panel** — a chat-style sidebar. If it's not visible, you can open it by:

- Clicking the **agent icon** in the activity bar (the vertical icon strip on the far right)
- Using the keyboard shortcut **Ctrl+Shift+A**
- Going to **View > Agent Panel** in the menu bar

The panel has a text input at the bottom where you type prompts, and a conversation area above where responses appear. At the top, you'll see which AI model is active and how much context is being used.

### 🔧 Tide Code Feature: Agent Panel

The Agent Panel is your direct line to Pi. Unlike a separate browser-based AI tool, Pi lives inside your editor. It can see your project structure, read any file you've created, and propose changes with full awareness of your codebase. Think of it as a pair programmer who has already read every file in your project and remembers all of it.

The key difference from a regular chatbot: **Pi uses tools**. When you ask it to modify your code, it doesn't just show you a code block and say "paste this somewhere." It identifies the right file, reads its current contents, formulates precise edits, and writes them — with your permission.

### Your First Prompt: Priority Color-Coding

Let's start with something concrete. Your `TodoItem` component already has priority badges, but let's ask Pi to enhance them. Type this into the Agent Panel:

```
Add color-coded priority badges to the TodoItem component. High priority should be red, Medium should be yellow, Low should be green. Make the colors more vivid and add a subtle glow effect.
```

Press Enter and watch what happens.

### 🔧 Tide Code Feature: AI Tool Execution

As Pi processes your request, you'll see indicators that it's **using tools**. The conversation will show steps like:

1. **Reading file:** `frontend/src/components/TodoItem.tsx` — Pi reads the current component to understand its structure
2. **Reading file:** `frontend/src/App.css` — Pi checks the existing styles to see what's already there
3. **Writing file:** `frontend/src/App.css` — Pi proposes changes to the CSS

Each tool use appears in the conversation as a collapsible section. You can expand it to see exactly what Pi read or what changes it's proposing. This transparency is crucial — you always know what the agent is doing.

> 📖 **What just happened?** Pi didn't just generate code in a vacuum. It read your actual files, understood your existing class naming convention (`priority-low`, `priority-medium`, `priority-high`), and modified the CSS to match. It worked within your code's patterns rather than imposing its own.

### 🔧 Tide Code Feature: Approval Dialogs

When Pi wants to modify a file, a **diff view** appears showing exactly what will change. You'll see:

- **Red lines** (removals) — code that will be deleted or replaced
- **Green lines** (additions) — new code being added
- **Gray lines** (context) — unchanged code surrounding the edit, so you can see where the changes fit

At the bottom of the diff, you have two buttons:

- **Accept** — applies the changes to your file immediately
- **Reject** — discards the proposed changes; nothing is modified

Take a moment to read through the diff. Does the CSS look reasonable? Are the colors what you expected? If something looks off, reject and refine your prompt. If it looks good, accept.

> **Tip:** You don't have to accept everything blindly. Pi is powerful but not infallible. Review diffs the same way you'd review a pull request from a colleague. If a change is 90% right, accept it and manually fix the remaining 10% — that's still faster than writing it all from scratch.

### Iterative Prompting

Here's where the magic of conversational AI really shows. Pi remembers everything in the current session. You can build on the previous request. Type:

```
Add a completion animation — when a todo is checked off, it should briefly flash green and then fade the text. Use a CSS transition, not a JavaScript animation library.
```

This time Pi will likely modify both `TodoItem.tsx` (to add a CSS class during the transition) and `App.css` (to define the animation keyframes and transition properties). Watch the tool execution flow — you might see Pi:

1. Read `TodoItem.tsx` again (to see the current state, including any changes from the last prompt)
2. Read `App.css` (to find where to add animation styles)
3. Write changes to `TodoItem.tsx` (adding state or class logic for the animation)
4. Write changes to `App.css` (adding `@keyframes` and transition rules)

Each file modification gets its own approval dialog. You can accept some and reject others if you want — the changes are independent.

> 📖 **What just happened?** You made two requests that built on each other. Pi kept context from the first change (it knew the priority badges already existed and had specific class names) and layered new behavior on top. This iterative workflow — prompt, review, refine, prompt again — is the most effective way to work with the agent.

### 🔧 Tide Code Feature: Code Snippets

Sometimes you don't want to describe code in words — you want to point at it. Tide Code lets you select code in the editor and send it directly to Pi as context.

Try this:

1. Open `frontend/src/components/AddTodo.tsx` in the editor
2. Select the entire `handleSubmit` function and the form JSX (roughly lines 18 through the end of the component)
3. Right-click the selection
4. Choose **Send to Agent** from the context menu (or use the keyboard shortcut shown next to it)

A text box appears pre-populated with your selected code. Add your prompt above it:

```
Can you add form validation? Title should be required and at least 3 characters. Show an inline error message below the input when validation fails.
```

This gives Pi precise context. Instead of reading the whole file and figuring out which part you're talking about, it sees exactly the code you want modified, plus your instructions.

> **Tip:** Snippets are especially useful when you're working in a large file and want the agent to focus on a specific function or section. They reduce ambiguity and lead to more accurate edits.

### Understanding Agent Responses

Pi's responses are rendered as rich markdown in the Agent Panel. Here's what to look for:

- **Prose explanations** appear as regular text, often explaining the reasoning behind a change
- **Code blocks** include the file path at the top (e.g., `frontend/src/components/AddTodo.tsx`), making it clear which file is being discussed
- **File links** are clickable — if Pi mentions a file path, you can click it to open that file in the editor
- **Multiple changes** in a single response are presented sequentially, each with its own diff and approval dialog

When Pi writes a longer response, it typically follows this structure:

1. A brief acknowledgment of what you asked
2. An explanation of the approach it's taking
3. The actual file modifications (with diffs)
4. A summary of what changed and how to test it

### Common Prompting Patterns

Now that you've seen the basic flow, here are prompting strategies that work well with Pi:

**Be specific about files:** "In `TodoList.tsx`, add a sort-by-priority feature" works better than "add sorting to my app."

**Describe the behavior, not the implementation:** "When a user clicks a todo title, it should become editable inline" is better than "add a useState for editing and an input element with an onBlur handler." Let Pi figure out the implementation — it often knows patterns you haven't considered.

**Reference existing patterns:** "Follow the same style as the existing priority badges" tells Pi to look at your conventions rather than inventing new ones.

**Ask for explanations:** "Explain what this useEffect does and whether it could cause a memory leak" uses Pi as a code reviewer, not just a code writer.

### Committing the AI-Generated Changes

Check what Pi changed by looking at the source control indicators in the file tree — modified files will have a colored marker next to their name. Open the terminal and review:

```bash
cd taskflow
git diff frontend/
```

Read through the diff to make sure everything looks intentional. Then commit:

```bash
git add frontend/
git commit -m "Enhance UI with priority colors, animations, and form validation via AI agent"
```

You've just experienced the core workflow of Tide Code: write the foundation yourself, then collaborate with Pi to layer on features, polish, and refinements. In the next chapter, you'll connect your frontend and backend — and you'll see how Pi can reason across your entire stack.

---

## Chapter 6: Connecting the Stack

You have a backend serving data and a frontend rendering UI, but they're two ships passing in the night. In this chapter, you'll connect them into a single working application. More importantly, you'll discover that Pi can reason about your entire stack at once — reading Python and TypeScript files in the same thought, tracing a bug from a button click through a fetch call to an API endpoint and back.

### Running Both Servers

You need two servers running simultaneously: FastAPI on port 8000 and Vite on port 5173. If either is already running from earlier, great. If not, let's start them up.

### 🔧 Tide Code Feature: Multiple Terminals

Click the **+** icon in the terminal panel to create a new terminal tab. You should now have at least two tabs. Label them so you can tell them apart — right-click each tab and choose **Rename** (or just remember which is which by the directory shown in the prompt).

**Terminal 1 — Backend:**

```bash
cd taskflow/backend
uvicorn main:app --reload
```

**Terminal 2 — Frontend:**

```bash
cd taskflow/frontend
npm run dev
```

### 🔧 Tide Code Feature: Terminal Split View

Here's a trick for monitoring both servers at once. Grab the tab for your second terminal and **drag it toward the bottom** of the terminal panel. You'll see a drop indicator — release it to create a horizontal split. Now both terminals are visible simultaneously: backend logs on top, frontend logs on bottom (or however you arranged them).

This split is invaluable during full-stack development. When you submit a form in the browser, you'll see the Vite HMR logs in one pane and the FastAPI request logs in the other. If something fails, you immediately know which side broke.

### Verifying the API Configuration

Your `frontend/src/api.ts` already points to `http://localhost:8000` — you set that up in Chapter 4. Let's verify it's correct. Open the file and check the `API_BASE` constant:

```typescript
const API_BASE = "http://localhost:8000";
```

If that matches, you're ready. Open your browser to `http://localhost:5173` (the Vite dev server).

### Testing the Full Flow

Try the complete workflow:

1. **Add a task** — type "Buy groceries" in the input and click "Add Task." The task should appear in the list below.
2. **Add a detailed task** — click "More options," enter a title like "Finish project report," add a description, set priority to High, and submit.
3. **Toggle completion** — click the checkbox on a task. It should fade slightly (and if Pi added the animation in Chapter 5, you'll see the green flash).
4. **Delete a task** — click the X button on a task. It should disappear.

If everything works, congratulations — you have a full-stack application. If something doesn't work, keep reading.

### Debugging with the Agent

Things don't always connect cleanly on the first try. Here are common issues and how to use Pi to diagnose them.

**CORS errors** show up as red messages in the browser's developer console, usually saying something like "has been blocked by CORS policy." If you see this, open the Agent Panel and type:

```
I'm getting a CORS error when the frontend tries to reach the backend. Can you check my backend CORS configuration and fix it?
```

Pi will read `backend/main.py`, find the CORS middleware configuration, and check whether `http://localhost:5173` is in the allowed origins. If it isn't, Pi will propose adding it.

**Network errors** (like "Failed to fetch") usually mean the backend isn't running or is on a different port. Pi can help here too:

```
The frontend can't reach the backend. Can you check that the API base URL in api.ts matches the backend server's port?
```

### 🔧 Tide Code Feature: Cross-Codebase AI Context

This is where Tide Code's agent truly differentiates itself from generic AI tools. Watch what happens when you ask Pi a question that spans both codebases:

```
The delete button isn't working. Can you check the frontend fetch call in api.ts and the backend DELETE endpoint in main.py to find the issue?
```

In the tool execution trace, you'll see Pi:

1. **Read** `frontend/src/api.ts` — examining the `deleteTodo` function
2. **Read** `backend/main.py` — examining the DELETE endpoint
3. **Compare** the URL pattern, HTTP method, and response handling between the two

Pi might find that the frontend is sending `DELETE /todos/5` but the backend route is `/todos/{todo_id}` with a different parameter name, or that the frontend isn't handling the response status correctly. Whatever the issue, the agent reads both sides of the conversation — the JavaScript that sends the request and the Python that receives it — in a single chain of thought.

> 📖 **What just happened?** Most AI coding tools operate on a single file at a time. Pi operates on your entire project. When you describe a symptom ("the delete button isn't working"), it can trace the problem across languages, frameworks, and directories. It reads the button's click handler in React, follows it to the API client, checks the fetch URL, then jumps to the Python backend to verify the route exists and handles the request correctly. This cross-stack awareness is what makes Tide Code's agent useful for real-world debugging, not just code generation.

### 🔧 Tide Code Feature: Status Bar

Take a look at the bottom of the Tide Code window. The **status bar** contains several useful indicators:

- **Model name** — shows which AI model is powering Pi (you'll see the model identifier on the left side)
- **Context usage** — a meter showing how much of the agent's context window is in use. As you have longer conversations and Pi reads more files, this fills up. If it gets close to full, start a new conversation with **Ctrl+L**
- **Git branch** — shows your current branch name (`main` unless you've created a feature branch)
- **File info** — when you have a file open, shows the language mode (TypeScript, Python, CSS), line/column position, and encoding

The context usage indicator is particularly important. Every file Pi reads and every message in your conversation takes up context space. For complex debugging sessions that involve many files, keep an eye on this meter.

### Adding a Cross-Stack Feature with the Agent

Now let's do something ambitious. You'll ask Pi to add a feature that requires changes to both the frontend and the backend in a single prompt. This is the workflow you'll use daily in real projects.

The `description` field already exists in the backend model and the frontend types, but let's say you want to make it more prominent. Type this into the Agent Panel:

```
I want to add a "category" field to the todo form. The backend already supports it in the database schema. Add a text input for category in the AddTodo form, display the category as a tag on each TodoItem, and make sure the API calls include the category field.
```

Watch the agent work through this. It will likely:

1. **Read** `frontend/src/types.ts` — confirm that `category` is already in the TypeScript interfaces
2. **Read** `backend/main.py` — verify the backend accepts and returns `category`
3. **Read** `frontend/src/components/AddTodo.tsx` — see the current form structure
4. **Write** `frontend/src/components/AddTodo.tsx` — add a category input field with state management
5. **Read** `frontend/src/components/TodoItem.tsx` — see how other metadata is displayed
6. **Write** `frontend/src/components/TodoItem.tsx` — add category tag rendering (which may already exist from Chapter 4's code)
7. **Read** `frontend/src/App.css` — check existing styles
8. **Write** `frontend/src/App.css` — add styles for the category input and tag if needed

Each file modification gets its own diff and approval dialog. Review each one. Notice how Pi maintains consistency — it uses the same CSS class naming convention, the same component patterns, the same TypeScript types.

After accepting all changes, test the feature:

1. Open the browser and refresh if needed
2. Click "More options" on the add form
3. Enter a task with a category (e.g., "Work" or "Personal")
4. Submit and verify the category tag appears on the todo card
5. Check the backend — open `http://localhost:8000/todos` in a new browser tab to see the raw JSON and confirm the category is stored

> **Tip:** If Pi's changes don't quite match what you wanted, don't start over. Follow up with a refinement: "The category tag looks good, but can you make it appear next to the priority badge instead of below it?" Iterative refinement is faster than trying to get the perfect result in one prompt.

### Understanding the Full Architecture

Step back and look at what you've built. Open the file tree and expand all directories:

```
taskflow/
  landing/         ← Static HTML landing page
    index.html
    styles.css
    script.js
  backend/         ← Python FastAPI server
    main.py
    models.py
    database.py
    requirements.txt
  frontend/        ← React TypeScript app
    src/
      types.ts
      api.ts
      App.tsx
      App.css
      index.css
      components/
        TodoItem.tsx
        TodoList.tsx
        AddTodo.tsx
    package.json
    vite.config.ts
```

Three subdirectories, three technologies, one application. The data flows like this:

1. User interacts with a React component (`AddTodo.tsx`)
2. Component calls a function in the API client (`api.ts`)
3. API client sends an HTTP request to `localhost:8000`
4. FastAPI receives the request, validates it with Pydantic (`models.py`)
5. The endpoint function in `main.py` interacts with SQLite via `database.py`
6. The response travels back: database to Python to JSON to fetch to React state to rendered UI

Every layer has type safety. Python uses Pydantic models, TypeScript uses interfaces, and they agree on the shape of the data. When they disagree — and they will, as you evolve the app — Pi can spot the mismatch because it reads both sides.

### Final Commit

Let's commit the connected, working application:

```bash
cd taskflow
git add .
git commit -m "Connect frontend to backend, add category feature to full stack"
```

### What You've Accomplished

Across these three chapters, you went from an empty frontend directory to a fully connected full-stack application — and you learned to collaborate with an AI agent along the way. Here's the progression:

- **Chapter 4:** You built every component by hand, understanding React's data flow and component architecture from the ground up.
- **Chapter 5:** You introduced Pi as a collaborator, using it to add polish and features through iterative prompting, code snippets, and careful diff review.
- **Chapter 6:** You connected the stack, used Pi to debug cross-language issues, and added a feature that touched every layer of the application in a single conversation.

This is the Tide Code workflow: understand your code, then amplify your productivity with the agent. The next chapters will take you deeper — into testing, deployment, and the more advanced AI features that make complex projects manageable.

## Chapter 7: Orchestration — The Power Feature

Up to this point, every interaction you've had with Tide Code's agent has been a single prompt producing a single response. You typed something like "Add priority color-coding to the todo items," and the agent read a file, made some edits, and replied. That works well for small, focused tasks. But real-world feature development is rarely that simple.

What happens when you need to add a feature that touches your database schema, your API endpoints, your React components, and your CSS -- all in a coordinated way? That is where orchestration comes in, and it is the single most important capability that sets Tide Code apart from other AI coding tools.

### What Is Orchestration?

Orchestration is a multi-phase AI pipeline that takes a complex, multi-file task and breaks it into a structured plan, executes each step sequentially, and then reviews the results for correctness. Instead of throwing your entire request at the agent and hoping for the best, orchestration applies a disciplined process:

**Route** the task to the right model tier, **Plan** the implementation with discrete steps, **Build** each step in order, **Review** the output against acceptance criteria, and **Complete** with all changes applied.

Think of it this way:

|                     | Simple Agent Prompt                 | Orchestration                                                |
| ------------------- | ----------------------------------- | ------------------------------------------------------------ |
| **Scope**           | One-shot, usually touches 1-2 files | Multi-step, coordinates changes across many files            |
| **Planning**        | None -- the agent improvises        | Structured plan with numbered steps and acceptance criteria  |
| **Quality check**   | None -- you review manually         | Automated QA loop checks the output                          |
| **Model selection** | Default model                       | Complexity-aware routing picks the most capable model        |
| **Transparency**    | Chat messages                       | Pipeline Progress indicator, Plan Tab, step-by-step tracking |

### When to Use Orchestration

Use orchestration when your task involves any of these:

- Changes that span multiple files across different parts of the stack (backend + frontend)
- New features that require creating new files, not just editing existing ones
- Architectural decisions -- the agent needs to decide *how* to structure things, not just *what* to write
- Tasks where the order of operations matters (e.g., database schema before API, API before UI)

For our TaskFlow app, we have the perfect orchestration task.

### The Orchestration Task

You are going to ask Tide Code to add a complete category management system to TaskFlow. Here is the full prompt you will use:

```
Add a complete category management system to TaskFlow. Users should be able to
create, edit, and delete categories with custom colors. Todos should be assignable
to categories, and users should be able to filter the todo list by category.
```

This task is intentionally complex. Think about what it requires:

- **Backend**: A new `categories` table in SQLite, a foreign key on the `todos` table, new CRUD endpoints for categories (`POST /categories`, `GET /categories`, `PUT /categories/{id}`, `DELETE /categories/{id}`), and a query parameter on `GET /todos` for filtering by category
- **Frontend**: A new `CategoryManager` component for creating/editing/deleting categories, a color picker, a category selector in the `AddTodo` form, a filter bar on the todo list, and category badges on individual todo items
- **Styling**: Color-coded category badges, filter UI, and a management panel

No single-shot prompt can reliably coordinate all of that. This is exactly what orchestration was built for.

### Triggering Orchestration

There are two ways to trigger orchestration in Tide Code:

**1. Automatic detection.** When you type a prompt that contains keywords suggesting complexity -- words like "add a feature," "create a full," "backend and frontend," "implement a," "from scratch" -- Tide Code automatically routes it through the orchestration pipeline instead of sending it as a simple prompt. Your category management prompt contains several of these signals.

**2. Manual toggle.** In the agent panel's input toolbar (the row of small buttons below the text input), you will see a pipeline icon. Click it to force orchestration for your next message. The icon turns blue when active. The tooltip reads "Force orchestration (Cmd+Enter)."

### 🔧 Tide Code Feature: Orchestration Pipeline

The orchestration pipeline is a five-phase process that runs automatically once triggered. Let's walk through each phase in detail using your category management task.

**Step 1:** Type the following prompt into the agent panel:

```
Add a complete category management system to TaskFlow. Users should be able to
create, edit, and delete categories with custom colors. Todos should be assignable
to categories, and users should be able to filter the todo list by category.
```

If the pipeline icon is not already highlighted, click it to ensure orchestration is active. Then press **Enter** to send.

The moment you send this prompt, the **Pipeline Progress indicator** appears at the top of the agent panel. It shows five dots connected by lines, labeled: **Route**, **Plan**, **Build**, **Review**, **Done**. Each dot transitions from gray (pending) to blue (active) to green (complete) as the pipeline progresses.

---

### Phase 1: Routing

The first dot lights up blue and the label reads **Route**.

Behind the scenes, the `tide-classify` extension analyzes your prompt's complexity. It looks at several signals:

- **Keyword matching**: Your prompt contains "add a complete," "create, edit, and delete," and references both frontend concepts (filter, list) and backend concepts (categories, assignable). These match the complex tier.
- **Prompt length**: Longer prompts generally indicate more complex tasks.
- **Cross-stack references**: Mentioning both UI filtering and data management signals a multi-layer change.

Based on this analysis, the classifier assigns your prompt to the **complex** tier. The `tide-router` extension then selects the most capable model available from your configured providers. If you have an Anthropic API key configured, it might select Claude Opus. If you are using an OAuth subscription, it picks the most powerful model in that tier.

> 📖 **What just happened?** The routing phase ensures that complex tasks get the most capable model, while simple tasks like "fix this typo" use faster, cheaper models. This saves you money and time on easy tasks while ensuring quality on hard ones.

Routing typically completes in under a second. The Route dot turns green, and the pipeline advances.

---

### Phase 2: Planning

The second dot lights up: **Plan**.

This is where orchestration diverges most dramatically from a simple prompt. Instead of immediately writing code, the agent creates a structured implementation plan. It analyzes your codebase -- reading your existing models, API structure, component hierarchy, and database schema -- and produces a step-by-step plan.

#### Clarify Cards

During planning, the agent may realize it needs more information. When this happens, a **Clarify Card** appears in the agent panel. This is a special UI element with the agent's question and an input field for your answer.

For example, the agent might ask:

> "Should categories have a fixed set of colors to choose from, or should users be able to enter any hex color code?"

You can type your answer directly in the Clarify Card and press Enter. The planning phase will resume with your input incorporated. If you do not respond within the configured timeout (default: 120 seconds), the agent will proceed with reasonable defaults.

> 💡 **Tip:** Clarify Cards appear only when the agent genuinely needs input to make an architectural decision. They are not yes/no confirmations -- those are handled by the approval dialog. If you see a Clarify Card, take a moment to provide a thoughtful answer. It will significantly improve the quality of the plan.

#### The Plan

After analysis (and any clarification), the agent generates a plan. The plan is saved as a JSON file in `.tide/plans/` and includes:

- A **title** and **description** summarizing the feature
- Numbered **steps**, each with a title, description, and list of files it will touch
- **Acceptance criteria** that the review phase will check against

A typical plan for your category management task might look like this:

1. **Add categories table to database** -- Create the SQLite migration, add the Category model, add foreign key to todos
2. **Create category CRUD endpoints** -- POST, GET, PUT, DELETE for `/categories`
3. **Update todo endpoints for category support** -- Add `category_id` to todo creation/update, add filter parameter to GET
4. **Create CategoryManager component** -- React component with create/edit/delete UI and color picker
5. **Add category selector to AddTodo** -- Dropdown in the todo creation form
6. **Add category filter bar** -- Filter UI above the todo list
7. **Add category badges to TodoItem** -- Display category color and name on each todo

The agent may also generate a `research.md` file in `.tide/` containing notes about your existing code structure that it discovered during planning.

### 🔧 Tide Code Feature: Plan Tab

While planning is in progress (and after it completes), you can view the plan in the **Plan Tab**.

**Step 2:** Look at the tab bar at the top of the agent panel. You will see tabs labeled **Chat**, **Plan**, and **Logs**. Click **Plan**.

The Plan Tab shows:

- A **list of plans** at the top (sorted by most recent), each with a colored status dot, title, progress fraction (e.g., "0/7"), and timestamp
- The **selected plan's detail view** below, with the full title, a status badge (planning/in_progress/completed/failed), and a progress bar
- Each **step** listed with a status icon:
  - `○` (hollow circle) = pending
  - `◑` (half circle) = in progress
  - `●` (filled circle) = completed
  - `⊘` (crossed circle) = skipped

Click any step to expand it and see its description and the files it plans to modify. File names are clickable -- they will open that file in the editor.

> 📖 **What just happened?** The Plan Tab gives you full visibility into the agent's strategy *before* it starts writing code. This is critical for trust. You can review the plan, understand the approach, and even mentally prepare for the changes. In the future, plan editing will let you reorder or remove steps before building begins.

---

### Phase 3: Building

The third dot lights up: **Build**.

Now the agent executes the plan, one step at a time. Each step runs in its own session context, and the prompt it receives includes:

- The original task description
- The full plan
- Details about the current step (title, description, files to modify)
- Summaries of what previous steps accomplished
- Research context from the planning phase

Each step's prompt is prefixed with `[tide:orchestrated]`. This is a special marker that tells the `tide-router` extension to skip re-routing. Without this marker, the router might re-classify each step as a simple task and switch to a less capable model mid-feature. The marker ensures the same model tier is used throughout the entire orchestration.

### 🔧 Tide Code Feature: Pipeline Progress Indicator

During the build phase, the Pipeline Progress indicator provides real-time feedback. The Build label updates to show which step is executing: **Build 1/7**, then **Build 2/7**, and so on.

**Step 3:** Switch back to the **Chat** tab and watch the progress. You will see the agent's work streaming in real-time -- file edits, new file creations, and explanations of what it is doing at each step.

In the Plan Tab, steps transition from `○` (pending) to `◑` (in progress) to `●` (completed) as the build progresses. The progress bar fills up smoothly.

> ⚠️ **Warning:** The build phase can take several minutes for complex tasks like this one. Each step involves the agent reading files, reasoning about changes, and writing code. Do not close the window or navigate away. You can continue watching the progress or review completed steps while later steps execute.

---

### Phase 4: Reviewing

The fourth dot lights up: **Review**.

After all build steps complete, a review agent examines the output. The reviewer:

1. Checks the implemented code against the plan's acceptance criteria
2. Runs any configured QA commands (if you have set them up in Settings > Orchestration)
3. Looks for common issues: missing imports, type errors, inconsistent naming, incomplete implementations

If the reviewer finds issues, it generates **fix steps** and the pipeline loops back to the build phase to address them. This QA loop can iterate up to the configured maximum (default: 2 iterations).

For example, the reviewer might find:

> "The CategoryManager component imports `useState` but does not import `useEffect`, which is needed for the initial category fetch."

The agent would then re-enter the build phase for a targeted fix, and the review would run again.

> 📖 **What just happened?** The review phase acts as an automated code reviewer. It catches issues that a single-pass generation would miss. The iterative loop means the agent can self-correct, producing higher quality output than a one-shot approach.

---

### Phase 5: Complete

The fifth dot turns green: **Done**. All five dots are now green, and the connectors between them are green as well. The Pipeline Progress indicator shows the completed state.

### 🔧 Tide Code Feature: Cancelling Orchestration

At any point during phases 1 through 4, you can stop the pipeline by clicking the **Cancel** button that appears on the right side of the Pipeline Progress indicator. This aborts the current step and stops the pipeline. Changes made by already-completed steps are preserved -- cancelling does not roll back previous work.

If the orchestration appears to stall (no heartbeat received for 30 seconds), Tide Code will detect this and show a warning. The heartbeat is an internal signal emitted every 10 seconds during active orchestration to confirm the process is alive.

---

### Exploring the Results

**Step 4:** Once orchestration completes, explore what was built.

Open the **File Tree** (Cmd+B if it is not visible). You should see new and modified files:

In the **backend** directory:

- Modified `main.py` (or equivalent) with new category endpoints and updated todo endpoints
- Possibly a new models or schemas file for the Category model

In the **frontend** directory:

- New component files for category management
- Modified `App.tsx` or `TodoList.tsx` with category filtering
- Modified `AddTodo.tsx` with a category selector
- Modified `TodoItem.tsx` with category badges

Click through each file to review the changes. Open the terminal (Cmd+T) and verify both servers still run correctly:

```bash
# In the backend terminal tab
# The server should still be running, or restart it:
cd backend && python -m uvicorn main:app --reload --port 8000

# In the frontend terminal tab
cd frontend && npm run dev
```

Open your browser to the frontend URL and test the new features:

- Create a few categories with different colors
- Assign categories to your todos
- Try filtering by category
- Edit and delete categories

### Committing the Orchestrated Changes

**Step 5:** This is a significant milestone -- commit all the orchestrated changes.

Open the terminal and commit:

```bash
git add -A
git commit -m "feat: add category management system with CRUD, filtering, and color-coded badges

Orchestrated by Tide Code: created categories table, CRUD API endpoints,
CategoryManager component, category filter bar, and todo-category assignment."
```

> 💡 **Tip:** For orchestrated changes, it is good practice to mention that orchestration was used in the commit message. This helps your team understand that these changes were generated as a coordinated set, not as individual edits.

### Orchestration Settings

You can tune orchestration behavior in **Settings > Orchestration**. The key options are:

| Setting               | Default         | What it controls                                                        |
| --------------------- | --------------- | ----------------------------------------------------------------------- |
| Review Mode           | `fresh_session` | Whether the reviewer gets a clean context or reuses the build session   |
| Max Review Iterations | `2`             | How many times the QA loop can repeat before auto-completing            |
| QA Commands           | *(empty)*       | Shell commands the reviewer must run (e.g., `npm test`, `npm run lint`) |
| Clarify Timeout       | `120s`          | How long to wait for your answer to a Clarify Card                      |
| Lock Model            | `true`          | Prevent the router from switching models mid-orchestration              |

> 💡 **Tip:** If you have tests set up for your project, adding your test command to QA Commands is highly recommended. This means the review phase will actually run your tests and fix any failures before completing. For TaskFlow, you could add `cd frontend && npm test` once you have tests written.

---

## Chapter 8: Code Intelligence

Your TaskFlow project has grown significantly. Between the landing page, the FastAPI backend, the React frontend, and the orchestrated category management system, you now have dozens of files across multiple languages. Finding things is getting harder. Where was that `createTodo` function defined? Which files reference "priority"? How does data flow from the React filter dropdown to the SQLite query?

Tide Code has a suite of code intelligence features designed for exactly this situation. They work across languages, so your Python backend and TypeScript frontend are searchable from the same tools.

### Workspace Indexing

The foundation of Tide Code's code intelligence is its **workspace index** -- a SQLite database that contains a parsed representation of every symbol in your codebase.

### 🔧 Tide Code Feature: Workspace Indexing (Tree-sitter + SQLite)

When you open a project in Tide Code, the Rust backend automatically indexes your codebase. Here is what happens under the hood:

1. **File discovery**: The indexer walks your project directory, respecting `.gitignore` rules (so `node_modules`, `__pycache__`, and similar directories are skipped)
2. **Change detection**: Each file's content is hashed using xxHash. On subsequent indexing runs, only files that have actually changed are re-parsed
3. **AST parsing**: Tree-sitter -- the same parser used by many code editors -- parses each file into an abstract syntax tree. It supports TypeScript, JavaScript, Python, Rust, Go, and more
4. **Symbol extraction**: From each AST, the indexer extracts meaningful symbols: function definitions, class declarations, interface definitions, type aliases, method definitions, variable declarations, and React component definitions
5. **Storage**: All symbols are stored in `.tide/index.db`, a SQLite database with FTS5 (Full-Text Search 5) enabled for fast, typo-tolerant searches
6. **Live updates**: A filesystem watcher detects when you save files and incrementally re-indexes just the changed files

You can check the indexing status in the **status bar** at the bottom of the window. The Context Dial area shows the index status -- how many files and symbols have been indexed.

> 📖 **What just happened?** Unlike traditional IDE features that require language-specific servers (LSP), Tide Code's indexer uses tree-sitter to parse all languages natively in Rust. This means it is fast (milliseconds, not seconds), works offline, and does not require installing separate language servers for each language in your project.

### Code Search

The most immediate way to use code intelligence is through the **Search Panel**.

### 🔧 Tide Code Feature: Code Search

The Search Panel provides project-wide text search with regex support, case sensitivity toggles, and file type filtering.

**Step 1:** Open the Search Panel. You can find it in the sidebar -- look for the magnifying glass icon, or use the file tree's search area.

**Step 2:** Type `priority` into the search field and press Enter.

The results appear grouped by file. You should see matches in:

- Your backend Python files (the `priority` field in the database model, the API endpoint parameter)
- Your frontend TypeScript files (the priority prop in `TodoItem`, the color-coding logic, the `AddTodo` form)
- Possibly your CSS files (priority-related class names or styles)

Each result shows the file path, the line number, and the matching line with the search term highlighted. Click any result to open that file in the editor and jump directly to that line.

**Step 3:** Try a more targeted search. Click the **Aa** button to enable case-sensitive search, then search for `createTodo`. This finds the exact function definition in your backend and any frontend references to the API endpoint.

**Step 4:** Click the **filters** toggle to expand file filtering options. You can enter include patterns like `*.py` to search only Python files, or exclude patterns like `node_modules` to skip specific directories.

> 💡 **Tip:** The search panel also supports **find and replace** across your entire project. Click the arrow toggle on the left of the search input to reveal the replace field. Use this carefully -- it performs literal text replacement across all matching files. The "All" button replaces every match at once, or you can replace file-by-file using the per-file replace button.

### Symbol Search via the Agent

While the Search Panel finds text patterns, the workspace index enables the agent to find *symbols* -- functions, classes, components, and types -- by name. The agent accesses this through the `tide-index` extension, which provides tools like `tide_search_symbols` (FTS5 symbol search) and `tide_get_file_symbols` (all symbols in a specific file).

**Step 5:** Switch to the agent panel and ask:

```
What functions and components are defined in the frontend?
```

The agent uses the codebase index to enumerate the symbols it finds. It will list your React components (`App`, `TodoList`, `TodoItem`, `AddTodo`, and the new category components from orchestration), utility functions, and type definitions. This is much faster than having the agent read every file -- it queries the pre-built index directly.

### Understanding Code with the Agent

The agent's real power emerges when you ask it to *explain* how things work. Because it can search the index and read relevant files, it can trace data flow across your entire stack.

**Step 6:** Ask the agent:

```
Explain how the category filtering works end-to-end, from the React UI to the database query
```

Watch what the agent does. It will:

1. Search the index for symbols related to "category" and "filter"
2. Read the relevant frontend component (the filter bar or dropdown)
3. Trace the API call from the frontend to the backend endpoint
4. Read the backend route handler
5. Follow the database query logic
6. Explain the complete data flow in its response

This kind of cross-stack explanation is only possible because the agent has access to the codebase index and can efficiently locate relevant code without reading every file.

> 📖 **What just happened?** The agent used the `tide_search_symbols` tool to find category-related code across your codebase, then read the specific files it needed to understand the data flow. Without the index, it would have to guess which files to read or read all of them (quickly hitting context limits). The index makes the agent smarter and more efficient.

### 🔧 Tide Code Feature: Context Inspector

As your conversations with the agent grow longer and you ask it to read more files, you might wonder: how much of its context window is being used? The **Context Inspector** answers this question.

**Step 7:** Look at the **status bar** at the bottom of the Tide Code window. You will see a small circular indicator -- the **Context Dial**. It shows a visual representation of how full the agent's context window is. Click it.

The Context Inspector slides in as a side panel from the right. It shows:

- **Token usage**: The total tokens currently in context versus the model's budget, displayed as both a count and a percentage. For example: "42,380 / 200,000 tokens (21%)"
- **Token threshold colors**: Green means you have plenty of room. Yellow (above 60%) means context is getting full. Red (above 85%) means you are approaching the limit and the agent may start losing earlier context
- **Region tags**: Any code regions you have tagged (using Cmd+Shift+T in the editor) appear here. You can **pin** tags to auto-inject them into the agent's system prompt, ensuring it always has access to critical code sections
- **Compact button**: Clicking this triggers context compaction -- the agent summarizes older messages to free up token budget while preserving key information
- **New Session button**: Starts a completely fresh conversation, clearing all context

**Step 8:** Try tagging a region. Open one of your backend files in the editor, select the todo model definition (the class or dictionary that defines the todo schema), then press **Cmd+Shift+T**. A dialog appears asking you to label the tag. Name it something like "Todo Model" and confirm. The tag now appears in the Context Inspector.

**Step 9:** In the Context Inspector, click the pin icon next to your "Todo Model" tag to pin it. Pinned tags are automatically injected into the agent's context at the start of every conversation, ensuring the agent always knows your data model structure.

> 💡 **Tip:** Pinning is especially useful for code that the agent frequently needs but might lose during context compaction. Pin your database models, API schemas, or critical configuration files. But be selective -- every pinned tag uses token budget, reducing the space available for conversation.

### Git Status Awareness

One more code intelligence feature worth noting: the **status bar** shows your current git branch and whether you have uncommitted changes. This is a quick visual check that helps you stay oriented, especially after orchestration produces a large set of changes.

Look at the bottom-right of the status bar. You will see the branch name (likely `main`) and an indicator if there are dirty (uncommitted) files.

---

## Chapter 9: Skills & Extensions

Throughout this tutorial, you have been using Tide Code's AI agent for increasingly complex tasks. But the agent's capabilities are not fixed -- they can be extended through two systems: **Pi Extensions** (built-in, always active) and **Skills** (installable packages you add on demand).

### Pi Extensions: The Built-in Intelligence Layer

You have already been benefiting from Pi Extensions without realizing it. Every time you sent a prompt, a suite of TypeScript extensions ran behind the scenes, shaping how the agent understood and responded to your request. These extensions live in the `pi-extensions/` directory and are loaded automatically when the agent starts.

Let's review what each one does, now that you have seen them in action:

| Extension         | What It Does                                               | Where You Saw It                                                     |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `tide-classify`   | Classifies prompts as quick/standard/complex               | Chapter 7: determined your category task was complex                 |
| `tide-router`     | Routes prompts to the appropriate model tier               | Chapter 7: selected a powerful model for orchestration               |
| `tide-planner`    | Generates structured plans during orchestration            | Chapter 7: created the 7-step category management plan               |
| `tide-index`      | Connects the agent to the codebase index for symbol search | Chapter 8: enabled the agent to find functions and explain data flow |
| `tide-project`    | Injects project context (TIDE.md rules, project memory)    | Every chapter: the agent knew your project structure                 |
| `tide-safety`     | Safety guardrails (write approval, command approval)       | Chapter 5: you approved file writes and command executions           |
| `tide-session`    | Manages session summaries and project memory               | This chapter: you will use it to save project knowledge              |
| `tide-web-search` | Web search capability via Tavily API                       | Available when you configure a Tavily API key                        |

These extensions hook into the agent's lifecycle at specific points. For example, `tide-router` runs on `before_agent_start` to select the model before the LLM call happens. `tide-safety` runs on `tool_call` to intercept potentially dangerous operations. `tide-index` registers custom tools that the agent can invoke during its reasoning.

> 📖 **What just happened?** You have been using a multi-extension pipeline this entire time. The orchestration pipeline from Chapter 7 used `tide-classify` + `tide-router` for routing, `tide-planner` for plan generation, `tide-project` for context injection, and `tide-safety` for approval gates. Extensions compose together seamlessly -- each one handles its specific concern without interfering with the others.

### What Are Skills?

While Pi Extensions are built into Tide Code and always active, **Skills** are installable capability packages that you add when you need them. Think of skills as expertise modules -- each one teaches the agent how to handle a specific type of task by providing it with specialized instructions.

Under the hood, a skill is a markdown file containing structured instructions that get injected into the agent's context when relevant. Skills can be published as npm packages, hosted in git repositories, or stored as local files.

### 🔧 Tide Code Feature: Skills Settings Panel

**Step 1:** Open **Settings** (Cmd+,) and navigate to the **Skills** tab.

The Skills panel has three main sections:

1. **Header**: The "Skills" heading with a refresh button (the circular arrow) to re-scan for installed skills
2. **Install bar**: A text input and "Install" button where you enter a skill source
3. **Installed skills list**: Cards showing each installed skill with its name, source badge, description, file path, and a remove button

If you have not installed any skills yet, you will see the message "No skills installed."

### Installing a Skill

**Step 2:** Let's install a skill. The install input accepts three formats:

- **npm package name**: For skills published to the npm registry (e.g., `pi-skills`)
- **Git URL**: For skills hosted in repositories (e.g., `git:github.com/user/skill-repo`)
- **Local path**: For skills on your filesystem (e.g., `./my-custom-skill`)

Type a skill source into the install input and click **Install** (or press Enter). The button changes to "Installing..." while the installation runs.

Below the install bar, you will see format examples:

```
pi-skills          (npm)
git:github.com/user/repo   (git)
./my-skill         (local)
```

> ⚠️ **Warning:** After installing a skill, you need to restart the Pi agent for it to take effect. The Skills panel displays a note about this: "Pi restart required after install." You can restart Pi by starting a new session (click the New Session button in the Context Inspector, or use the Command Palette with Cmd+Shift+P and search for "new session").

**Step 3:** After installation completes, click the **refresh button** (the circular arrow next to the "Skills" heading) to reload the skills list. Your newly installed skill should appear as a card with:

- The skill **name** in bold
- A **source badge** showing where it was installed from (e.g., `package:pi-skills`)
- A **description** of what the skill does
- The **file path** where the skill is stored on disk
- A **remove button** (the x icon) to uninstall it

### Using Skills in Practice

Skills activate automatically when relevant. You do not need to explicitly invoke them -- the agent recognizes when a skill applies based on your prompt and the skill's domain.

For example, if you installed a code review skill, you could ask:

```
Review my backend code for potential issues
```

The agent's response would be guided by the skill's review methodology -- looking at specific patterns, checking for common mistakes, and providing structured feedback that follows the skill's instructions.

Skills can cover a wide range of domains:

- **Code review**: Structured review processes with severity ratings and fix suggestions
- **Testing**: Test generation strategies for specific frameworks
- **Documentation**: API documentation patterns and standards
- **Security**: Security audit checklists and vulnerability patterns
- **Framework-specific**: Best practices for React, FastAPI, Django, Express, and others

### Removing a Skill

If you no longer need a skill, click the **x button** on its card in the Skills panel. This removes the skill files and updates the configuration. As with installation, a Pi restart is needed for the removal to take full effect.

### 🔧 Tide Code Feature: Project Memory

Beyond skills, Tide Code has a built-in system for persistent project knowledge called **project memory**. This is managed by the `tide-session` and `tide-project` extensions and stored in `.tide/memory.json`.

Project memory is a key-value store where the agent can save and retrieve facts about your project. Unlike conversation history (which is lost between sessions or compacted when context runs low), memory entries persist indefinitely.

**Step 4:** Try it out. In the agent panel, type:

```
Remember that we're using SQLite for now but plan to migrate to PostgreSQL later
```

The agent will use the `tide_memory_write` tool to store this fact. It picks a descriptive key (something like `database_plan`) and saves your statement as the value.

**Step 5:** Start a new session to verify persistence. Open the Context Inspector (click the Context Dial in the status bar), then click the **New Session** button and confirm.

In the fresh session, ask:

```
What database are we using and what are our plans for it?
```

The agent uses `tide_memory_read` to retrieve the stored fact and answers accurately, even though the previous conversation is gone. The memory survived the session change because it is stored in a file, not in the conversation context.

**Step 6:** You can also ask the agent to list everything it remembers:

```
What do you remember about this project?
```

The agent will call `tide_memory_read` without a specific key, which returns all stored entries. You will see a list of key-value pairs representing everything the agent has learned about your project.

> 💡 **Tip:** Project memory is especially useful for recording architectural decisions, coding conventions, and planned future work. Some good things to store:
> 
> - "We use camelCase for frontend variables and snake_case for backend"
> - "The frontend uses React Query for server state management"
> - "Authentication is planned for Phase 2 but not yet implemented"
> - "All API endpoints should return consistent error objects with code, message, and details fields"

### Session Summaries

Related to project memory, the `tide-session` extension also supports **session summaries**. At the end of a productive work session, you can ask the agent to save a summary:

```
Save a session summary of what we accomplished today
```

The agent calls `tide_session_summary`, which generates a markdown file in `.tide/sessions/` containing:

- A summary of what was accomplished
- A list of files that were changed during the session
- Key decisions that were made
- Tools that were used
- Remaining TODOs and follow-up items

These summaries serve as a project journal. When you come back to the project after a break, you (or the agent) can review past session summaries to quickly get back up to speed.

**Step 7:** Try it. Ask the agent:

```
Save a session summary. We built a TaskFlow todo app with a landing page, FastAPI backend,
React frontend, and used orchestration to add a category management system.
```

After the agent saves the summary, you can find it in the `.tide/sessions/` directory. The filename includes a timestamp so summaries are naturally sorted chronologically.

### The .tide Directory

By now, your `.tide/` directory has accumulated several important files. Let's review what lives there:

```
.tide/
  index.db              # The tree-sitter codebase index (SQLite + FTS5)
  memory.json           # Project memory key-value store
  router-config.json    # Model routing preferences
  orchestrator-config.json  # Orchestration settings
  research.md           # Research notes from the planning phase
  plans/                # Plan JSON files from orchestration
  sessions/             # Session summary markdown files
  tags/                 # Region tags you created
```

This directory is project-specific -- each workspace you open in Tide Code gets its own `.tide/` folder. You can choose to commit it to version control (useful for sharing project memory and session summaries with your team) or add it to `.gitignore` (if you prefer to keep AI-generated context local).

> 💡 **Tip:** If you work on a team, committing `.tide/memory.json` can be valuable. It means every team member's agent inherits the same project knowledge -- coding conventions, architectural decisions, and planned migrations. Just be careful not to store sensitive information in memory entries.

### Putting It All Together

Let's step back and appreciate what you have built and learned across these three chapters:

- **Chapter 7** showed you how orchestration coordinates complex, multi-file changes through a structured pipeline of routing, planning, building, and reviewing. You used it to add an entire category management system to TaskFlow in one pass.
- **Chapter 8** gave you the tools to navigate your growing codebase efficiently -- the workspace index, code search, the Context Inspector, and agent-powered code explanations.
- **Chapter 9** revealed the extension and skill system that powers all of this, and showed you how to extend the agent's capabilities with installable skills and persistent project memory.

The TaskFlow app you have built is no longer a simple todo list. It has a landing page, a full REST API, a React frontend with category management, priority color-coding, completion animations, and form validation -- all built through an AI-assisted workflow that gave you visibility and control at every step.

**Step 8:** Make a final commit to capture your current state:

```bash
git add -A
git commit -m "chore: add session summary and project memory entries

Saved project context to .tide/ for future session continuity."
```

You now have the skills to use Tide Code for real project work. The pattern is always the same: use simple prompts for focused edits, orchestration for complex features, the index for navigation, and memory for continuity. The agent is a tool -- and like any good tool, it gets more powerful the better you understand how to use it.

## Chapter 10: Sessions & Workflow Management

By now you've had several productive conversations with the AI agent while building TaskFlow. But here's something you may have noticed: every time you close the Agent Panel and come back, your conversation is still there. That's because Tide Code organizes your work into **sessions** -- persistent conversations that remember everything you discussed, every tool the agent ran, and every result it produced.

In this chapter, you'll learn how to manage sessions effectively, control the context window, pick the right model for each task, and adjust how deeply the agent thinks before responding.

---

### Understanding Sessions

A session in Tide Code is a complete conversation thread between you and the AI agent. Think of it like a chat thread in a messaging app, but much richer -- it stores not just the text back and forth, but also every file the agent read, every command it executed, and every result it received.

Sessions are stored as files in your project's `.pi/agent/sessions/` directory. Each session file contains the full history of that conversation in a structured format. This means your conversations are:

- **Persistent** -- they survive app restarts
- **Project-local** -- each workspace has its own sessions
- **Portable** -- they're just files, so they move with your project

### 🔧 Tide Code Feature: Session History Panel

The Session History panel lives inside the Agent Panel. Look at the tabs along the top of the Agent Panel -- you'll see **Chat**, **Logs**, **Plan**, and **History**. Click the **History** tab now.

You'll see a list of all your past sessions for this workspace. Each entry shows:

- **Session name** -- either a name you gave it or "Untitled"
- **Message count** -- how many messages were exchanged (e.g., "12 msgs")
- **Timestamp** -- when the session was last active, shown as relative time ("2h ago", "Yesterday", etc.)
- **Active badge** -- the currently active session is marked with a small "active" label

The panel also has two buttons in the header:

- **+** (New Session) -- creates a fresh session
- **Refresh** -- reloads the session list from disk

Try clicking on a previous session to load it. You'll see the full conversation history appear in the Chat tab, including all the agent's responses and tool executions from that session.

### Starting a New Session

There are times when you want a clean slate. Starting a new session gives you a fresh conversation with no prior context. The agent won't remember what you discussed before (though it can still see your project files).

**When to start a new session:**

- You're switching to a completely different task (e.g., from frontend work to backend debugging)
- The current conversation has gotten very long and the agent is losing track of earlier details
- You want to approach a problem from scratch without the agent being influenced by a previous attempt
- You've finished a major feature and want to start the next one cleanly

**How to start one:**

1. Open the Agent Panel and click the **History** tab
2. Click the **+** button in the header
3. A new empty session is created and becomes active

You can also start a new session from the Command Palette (Ctrl+Shift+P) by searching for "New Session."

### Forking a Session

Sometimes you're mid-conversation and want to try two different approaches without losing either one. That's what session forking is for.

### 🔧 Tide Code Feature: Session Forking

Forking creates a copy of your current session up to the current point. You continue working in the fork, and the original session remains untouched. It's like creating a branch in git, but for your conversation.

**Use case:** You've been discussing how to implement sorting for TaskFlow's todo list. The agent suggested two approaches -- client-side sorting in React state, or server-side sorting via new API parameters. You want to explore both without losing either conversation thread.

1. Have the agent explain the first approach
2. Fork the session -- now you have a copy
3. Continue exploring the first approach in the fork
4. Switch back to the original session via the History tab
5. Ask the agent to explore the second approach there

Forking is available through the Agent Panel's context actions. This is particularly useful during architectural decisions where you want to compare two paths before committing to one.

> 💡 **Tip:** Forking is especially powerful during orchestration runs. If a pipeline produces results you're unsure about, fork before the agent applies changes, then compare the two outcomes.

---

### Context Management

Every AI model has a finite context window -- a maximum number of tokens (roughly, pieces of words) it can consider at once. As your conversation grows, you're filling up that window with messages, code snippets, tool results, and more. Understanding and managing this budget is key to productive work.

### 🔧 Tide Code Feature: Context Dial

Look at the **status bar** at the bottom of the Tide Code window. You'll see a small circular dial with a percentage next to it -- that's the **Context Dial**. It shows how full your context window currently is.

The dial changes color based on usage:

| Color  | Usage     | Meaning                                                         |
| ------ | --------- | --------------------------------------------------------------- |
| Green  | Under 60% | Plenty of room -- the agent has full recall of the conversation |
| Yellow | 60-85%    | Getting full -- older messages may start being summarized       |
| Red    | 85%+      | Nearly full -- compaction will happen soon                      |

Hover over the Context Dial to see a detailed tooltip showing:

- **Total tokens used** and the **budget** (maximum)
- **Category breakdown** -- how tokens are distributed (conversation history, system prompt, tool results, etc.)
- **Code index stats** -- if you've indexed your workspace, it shows file and symbol counts

Click the Context Dial to open the **Context Inspector**, which gives you a full view of everything in the context window and lets you manage it directly.

> 📖 **What just happened?** The context window is the agent's "working memory." Just like you might forget the beginning of a very long meeting, the agent can lose track of earlier conversation when the window fills up. The Context Dial lets you monitor this in real-time so you're never surprised.

### Auto-Compaction

When your context gets too full, Tide Code can automatically **compact** it. Compaction works by summarizing older parts of the conversation -- the agent creates a condensed version that captures the key points and decisions, freeing up space for new messages.

### 🔧 Tide Code Feature: Auto-Compaction

Auto-compaction is controlled by the context store. When enabled, Tide monitors the context usage after each agent response. If usage exceeds the threshold (default: 90%), compaction triggers automatically.

Here's what happens during auto-compaction:

1. Tide detects that context usage has crossed the threshold
2. A compaction request is sent to the agent
3. The agent summarizes older messages into a condensed form
4. The original messages are replaced with the summary
5. Context usage drops significantly -- giving you room to continue

You can also trigger compaction manually:

1. Click the **Context Dial** to open the Context Inspector
2. Click the **Compact** button
3. Watch the usage percentage drop as the agent summarizes the conversation

> ⚠️ **Warning:** After compaction, the agent's memory of earlier conversation becomes a summary rather than the full text. Specific code snippets or exact error messages from early in the conversation may be lost. If you know you'll need to reference something later, consider starting a new session or noting the key details in a comment.

The auto-compaction threshold of 90% is a good default. It kicks in late enough that you get full context for as long as possible, but early enough to avoid hitting the hard limit where messages would be dropped entirely.

---

### Model Selection

Different AI models have different strengths, speeds, and costs. Tide Code supports multiple providers and lets you pick the right model for each situation.

### 🔧 Tide Code Feature: Model Picker

In the status bar, next to the Context Dial, you'll see the **Model Picker** -- it shows the name of the currently active model. Click it to open a dropdown with all available models.

The dropdown is organized into sections:

**Router (Auto mode):**

- **Auto** -- Tide automatically picks the best model for each prompt based on complexity. The display shows "Auto" followed by the current model name (e.g., "Auto . claude-sonnet-4-20250514").

**Manual model selection:**
Models are grouped by provider (Anthropic, OpenAI, Google, etc.). Each provider you've configured with an API key will appear as a group with its available models listed.

**When to use different models:**

| Situation                           | Recommended Approach             |
| ----------------------------------- | -------------------------------- |
| Quick questions, formatting         | Auto mode or a fast model        |
| General coding tasks                | Auto mode (standard tier)        |
| Complex refactors, architecture     | A flagship model (Claude, GPT-4) |
| Rapid iteration, many small prompts | A faster, cheaper model          |

When you manually select a model, Auto mode is turned off. The picker shows the exact model name so you always know what's generating responses.

> 💡 **Tip:** If you're on a budget, use Auto mode. It routes simple questions to cheaper, faster models and saves the powerful (expensive) models for complex tasks. You get the best of both worlds.

### Model Routing Configuration

Auto mode is powered by Tide's built-in **router classifier**. It analyzes each prompt you send and categorizes it into one of three tiers:

- **Quick** -- short questions, typos, renames, simple formatting
- **Standard** -- general coding tasks, explanations, writing tests
- **Complex** -- multi-file refactors, architectural decisions, complex debugging

You can configure which model handles each tier:

1. Open Settings (Ctrl+, or Command Palette > "Open Settings")
2. Navigate to the **Routing** section in the sidebar
3. Toggle **Enable auto-routing** on
4. For each tier (Quick, Standard, Complex), pick a model from the dropdown

The tier dropdowns show all available models grouped by provider, plus an "Auto-detect" option that lets Tide choose the best available model for that tier.

> 📖 **What just happened?** Model routing is like having a smart dispatcher. Instead of always using the most expensive model, the router looks at your prompt and decides: "This is a simple rename -- use a fast model" or "This is a complex multi-file refactor -- bring in the heavy hitter." You save money and time on simple tasks while getting maximum quality on hard problems.

---

### Thinking Levels

Beyond choosing which model to use, you can control **how deeply** the agent thinks before responding. This is the thinking level -- it determines how much internal reasoning the model does before generating its answer.

### 🔧 Tide Code Feature: Thinking Level Picker

In the status bar, you'll find the **Thinking Level Picker** next to the Model Picker. It shows the current thinking level with a visual indicator. Click it to see all available levels:

| Level   | Icon                 | Best For                                   |
| ------- | -------------------- | ------------------------------------------ |
| Off     | Empty circle         | Maximum speed, simple factual responses    |
| Minimal | Quarter-filled       | Quick answers, boilerplate code            |
| Low     | Half-filled          | Standard coding questions                  |
| Medium  | Three-quarter filled | Multi-step problems (default)              |
| High    | Filled circle        | Complex debugging, architectural decisions |
| Max     | Large filled circle  | The hardest problems -- deep reasoning     |

**When to crank it up:**

- You're debugging a subtle race condition
- You're designing the architecture for a new feature
- You need the agent to consider edge cases and tradeoffs
- You're asking about a tricky algorithm

**When to keep it low:**

- You need boilerplate code generated
- You're asking the agent to format or rename something
- You want a quick factual answer
- Speed matters more than depth

Let's try it. Set your thinking level to **High** -- you'll use this in Chapter 12 when we add due dates to TaskFlow, which requires coordinated changes across the entire stack.

> 💡 **Tip:** Higher thinking levels take longer and use more tokens, but they produce noticeably better results for complex tasks. Think of it like asking someone to "take their time and really think about it" versus "just give me a quick answer." Use the right level for the right situation.

---

### Putting It All Together: A Session Workflow

Here's a workflow that ties everything together. Imagine you're starting a new day of work on TaskFlow:

1. **Check the History tab** -- Review yesterday's sessions to remember where you left off
2. **Start a new session** -- Today is a new task, so start fresh
3. **Set Auto mode** in the Model Picker -- let Tide route models efficiently
4. **Set thinking to Medium** -- a good default for general work
5. **Work normally** -- chat with the agent, write code, run tests
6. **Monitor the Context Dial** -- when it turns yellow, you know you're using significant context
7. **Bump thinking to High** when you hit a hard problem -- get deeper analysis
8. **Let auto-compaction handle context** -- it will summarize when needed
9. **Fork if you want to explore alternatives** -- compare approaches safely

This workflow keeps you productive while making the most of the AI's capabilities. You're not wasting powerful models on simple tasks, you're managing context proactively, and you're using sessions to keep your work organized.

---

### Summary

In this chapter, you learned how to manage your workflow across sessions:

- **Sessions** persist your full conversation history in `.pi/agent/sessions/`
- **Session History** lets you browse, load, create, and fork sessions
- **The Context Dial** shows real-time context window usage with color-coded thresholds
- **Auto-compaction** automatically summarizes old messages when context gets full
- **The Model Picker** lets you choose from multiple AI providers or use Auto mode
- **Model routing** maps prompt complexity to model tiers for cost-efficient work
- **Thinking levels** control reasoning depth from Off to Max

These tools let you work on projects over days and weeks without losing productivity to context limits or model mismatches.

---

## Chapter 11: Power User Features

You've been using Tide Code's core features throughout this tutorial -- the file tree, editor, terminal, agent panel, and orchestration. Now it's time to unlock the features that separate casual users from power users. These are the shortcuts, settings, and tools that make your workflow feel effortless.

---

### The Command Palette

If you learn one power user feature, make it this one. The Command Palette is a fuzzy-search launcher that gives you instant access to every action in Tide Code without touching the mouse.

### 🔧 Tide Code Feature: Command Palette

Press **Ctrl+Shift+P** (or Cmd+Shift+P on macOS) to open the Command Palette. A search box appears at the top center of the screen with a dark overlay behind it.

Start typing, and commands are filtered in real-time using fuzzy matching. You don't need to type the exact name -- "ntm" will match "New Terminal," and "tofi" will match "Toggle File Tree."

Each command in the list shows:

- **Category** -- which part of Tide Code the command belongs to (General, Editor, Terminal, Agent, etc.)
- **Label** -- the command name
- **Shortcut** -- if the command has a keyboard shortcut, it's shown on the right

Navigate with arrow keys and press Enter to execute, or click directly. Press Escape to close without executing.

Try these commands right now:

| Type this...  | To do this...                             |
| ------------- | ----------------------------------------- |
| `new term`    | Open a new terminal                       |
| `toggle file` | Show/hide the file tree sidebar           |
| `settings`    | Open the Settings panel                   |
| `index`       | Index the workspace for code intelligence |
| `new session` | Start a fresh agent session               |

> 📖 **What just happened?** The Command Palette is a universal launcher. Instead of hunting through menus or remembering where a button lives, you just describe what you want to do. Tide Code's fuzzy matcher is forgiving -- it matches against command labels, categories, and keywords, so you'll find what you need even with partial input.

The Command Palette becomes second nature quickly. Within a few days, you'll reach for Ctrl+Shift+P instinctively instead of clicking through the UI.

---

### Essential Keyboard Shortcuts

Tide Code follows VS Code keyboard conventions, so if you've used VS Code before, most shortcuts will feel familiar. Here's a reference for the most important ones.

#### General

| Shortcut     | Action                   |
| ------------ | ------------------------ |
| Ctrl+Shift+P | Open Command Palette     |
| Ctrl+O       | Open folder              |
| Ctrl+B       | Toggle file tree sidebar |
| Ctrl+,       | Open Settings            |
| Ctrl+T       | Toggle terminal panel    |

> 💡 **Tip:** On macOS, replace Ctrl with Cmd for all of these shortcuts. Tide Code automatically adapts to your platform.

#### Editor

| Shortcut     | Action                                      |
| ------------ | ------------------------------------------- |
| Ctrl+S       | Save current file                           |
| Ctrl+Shift+T | Tag selected region (in editor or terminal) |

Region tagging is a Tide-specific feature -- select a block of code or terminal output, press Ctrl+Shift+T, and it becomes a tagged reference that you can mention in agent conversations. This was covered in Chapter 8 with code intelligence.

#### Agent Panel

| Shortcut    | Action                              |
| ----------- | ----------------------------------- |
| Enter       | Send message to the agent           |
| Shift+Enter | Insert a new line (without sending) |

#### Dialogs (Approval prompts, etc.)

| Shortcut   | Action                |
| ---------- | --------------------- |
| Enter      | Approve / Submit      |
| Escape     | Deny / Cancel / Close |
| Ctrl+Enter | Submit editor dialog  |

These dialog shortcuts are especially useful during orchestration runs, where you may need to approve multiple file changes. Rather than clicking "Approve" each time, just press Enter.

> 💡 **Tip:** You can view and customize all keyboard shortcuts in Settings > Shortcuts. The shortcuts panel shows every registered shortcut organized by category.

---

### Settings Deep Dive

You've touched Settings a few times throughout this tutorial -- adding API keys, configuring orchestration. Now let's do a complete walkthrough of every section.

Open Settings with **Ctrl+,** or through the Command Palette. You'll see a sidebar on the left with seven sections. Let's walk through each one.

### 🔧 Tide Code Feature: Settings Panel

#### General

The General section covers the basics:

**About** -- Shows version numbers for Tide and the Pi Agent. Useful when reporting issues or checking for updates.

**Command Line** -- This is where you install the `tide` CLI command (more on this in a moment).

**Appearance** -- The App Theme selector. This changes the color scheme of the entire application. Currently available themes:

- **Tokyo Night** -- A cool-toned dark theme with blue accents (the default)
- **One Dark** -- The popular Atom theme, warm and balanced
- **GitHub Dark** -- Clean and familiar if you spend time on GitHub
- **Catppuccin Mocha** -- Soft pastel colors on a dark background
- **Dracula** -- The classic purple-accented dark theme

Try switching between them to find your preference. The change applies instantly -- no restart needed.

**Terminal** -- The terminal has its own theme selector, separate from the app theme. You can have a Dracula app theme with a different terminal color scheme if you prefer. You can also adjust **scrollback lines** -- how many lines of terminal output are kept in memory. The default of 5000 is fine for most work, but increase it if you run commands with very long output.

> 💡 **Tip:** The app theme and terminal theme are independent. This means you can mix and match to get exactly the look you want. Some developers prefer a muted app theme with a high-contrast terminal, for example.

#### Provider Keys

This is where you add API keys for AI providers. Each provider you configure unlocks its models in the Model Picker.

Supported providers include:

- **Anthropic** -- Claude models
- **OpenAI** -- GPT models
- **Google** -- Gemini models

Your API keys are stored securely using your operating system's credential manager:

- On **Windows**, keys are stored in Windows Credential Manager
- On **macOS**, keys are stored in the Keychain
- On **Linux**, keys use the system keyring

This means your keys never appear in plain text files in your project directory. They're encrypted and managed by the OS.

> ⚠️ **Warning:** Never store API keys in `.env` files within your project, especially if the project is a git repository. The Provider Keys settings use secure OS-level storage specifically to prevent accidental key exposure.

#### Routing

We covered this in detail in Chapter 10. This is where you configure auto-routing -- mapping prompt complexity tiers (Quick, Standard, Complex) to specific models. The key setting here is the **Enable auto-routing** toggle, which activates the intelligent model router.

#### Orchestration

Pipeline settings for the orchestration system covered in Chapter 7:

- **Review mode** -- Choose between "Fresh session" (starts a new session for the review phase) or "Compact existing session" (summarizes and continues in the same session)
- **Max review iterations** -- How many review-and-fix cycles the pipeline will attempt before stopping

#### Safety

The Safety section controls how the agent handles potentially dangerous actions:

- **Yolo Mode** -- When ON, the agent auto-approves all tool calls without asking you. The toggle glows red as a reminder that you're running without guardrails.
- **Saved Permissions** -- A list of permissions you've previously saved through approval dialogs. When the agent asks to run a command and you click "Remember," the permission appears here. You can review and remove individual permissions, or clear them all.

For our TaskFlow project, you've probably been approving actions individually. That's the safest approach for learning. As you get comfortable, you might save permissions for common safe operations like reading files or running your test suite.

> ⚠️ **Warning:** Be cautious with Yolo Mode. It's convenient for trusted projects where you're the only developer, but it means the agent can write files, run commands, and make changes without asking. Keep it off when working with unfamiliar code or shared repositories.

#### Skills

The Skills section was covered in Chapter 9. This is where you view and manage installed skills that extend the agent's capabilities.

#### Shortcuts

A visual reference of all keyboard shortcuts, organized by category (General, Editor, Agent Panel, Dialogs). This is the same information from the shortcuts table above, but always accessible from within Tide Code.

---

### The `tide` CLI Command

Up until now, you've been opening projects through the Tide Code Dashboard. But there's a faster way -- launching Tide directly from any terminal.

### 🔧 Tide Code Feature: The `tide` CLI Command

To install the CLI command:

1. Open Settings (Ctrl+,)
2. Go to the **General** section
3. Find the **Command Line** section
4. Click **"Install 'tide' command"**

Tide will install a `tide` command that's accessible from any terminal on your system. After installation, you can:

```bash
# Open the current directory in Tide Code
tide .

# Open a specific project
tide /path/to/taskflow

# Open a specific file
tide /path/to/taskflow/backend/main.py
```

This is particularly useful when you're already working in a terminal and want to quickly open a project in Tide Code. Instead of launching the app, navigating to the Dashboard, and finding your workspace, you just type `tide .` and you're there.

> 💡 **Tip:** If the installation reports an error on Windows, you may need to restart your terminal (or open a new one) for the PATH changes to take effect. On macOS and Linux, it typically works immediately.

---

### App Themes in Practice

Let's take a moment to try different themes while looking at TaskFlow's code. This helps you see how each theme renders actual code, not just the UI chrome.

1. Open `frontend/src/App.tsx` in the editor
2. Open Settings with Ctrl+,
3. Go to General > Appearance
4. Switch through each theme:
   - **Tokyo Night** -- Notice the blue-purple color palette. Function names, strings, and keywords each get distinct, cool-toned colors.
   - **One Dark** -- Warmer tones. If you're coming from Atom or many VS Code setups, this will feel like home.
   - **GitHub Dark** -- Subtle and restrained. Good if you find other dark themes too colorful.
   - **Catppuccin Mocha** -- Soft and easy on the eyes for long sessions. The pastels reduce visual fatigue.
   - **Dracula** -- Bold and high-contrast. Everything pops against the dark background.

Pick the one that feels most comfortable for extended coding sessions. There's no wrong answer -- it's entirely personal preference.

Now try changing the terminal theme independently:

1. Still in Settings > General, scroll to the **Terminal** section
2. Change the terminal theme
3. Open a terminal (Ctrl+T) and run a command like `ls` or `git log --oneline` to see the new colors

> 📖 **What just happened?** Themes in Tide Code work by setting CSS custom properties on the root element. Each theme defines colors for backgrounds, text, accents, borders, and more. Because the app and terminal themes are separate, you get fine-grained control over your visual environment. The theme applies instantly because it's just swapping CSS variables -- no reload needed.

---

### Power User Workflow Tips

Here are some patterns that experienced Tide Code users rely on:

**1. Command Palette for everything.** Stop clicking. Ctrl+Shift+P + a few keystrokes is almost always faster than navigating menus or panels. Build the muscle memory.

**2. Keyboard-driven approval.** During orchestration or when the agent is making changes, use Enter to approve and Escape to deny. Your hands never leave the keyboard.

**3. Split your screen.** Keep the agent panel on one side, the editor in the center, and a terminal at the bottom. This layout lets you see the agent's work, review code, and check results simultaneously.

**4. Use region tags for precision.** When you want the agent to focus on a specific block of code, select it and tag it (Ctrl+Shift+T). Then reference the tag in your prompt. This is more precise than saying "look at lines 45-60 in App.tsx."

**5. Auto mode + thoughtful overrides.** Run Auto mode for model routing most of the time, but manually switch to a powerful model when you know the task is complex. The Model Picker remembers your choice until you switch back to Auto.

---

### Summary

In this chapter, you became a Tide Code power user:

- **The Command Palette** (Ctrl+Shift+P) gives you instant access to every action
- **Keyboard shortcuts** follow VS Code conventions for familiarity
- **Settings** are organized into seven sections covering appearance, providers, routing, orchestration, safety, skills, and shortcuts
- **The `tide` CLI** lets you open projects from any terminal
- **App themes** and **terminal themes** are independently configurable for your perfect visual environment

These features reduce friction in your daily workflow. The less time you spend navigating the IDE, the more time you spend writing great code.

---

## Chapter 12: Polish & Deploy

This is the final chapter. You've built a full-stack TaskFlow application with a landing page, a FastAPI backend, and a React frontend complete with categories, priorities, filtering, and completion animations. Now you'll use Tide Code's advanced AI features to add a final feature, generate documentation, run a code review, and wrap up the project.

---

### Adding Due Dates with High Thinking

Our TaskFlow app handles the basics well, but real todo apps need due dates. This feature touches every layer of the stack -- the database model, the API endpoints, the frontend components, and the styling. It's exactly the kind of cross-cutting feature where a higher thinking level pays off.

**Step 1: Set the thinking level to High**

Click the **Thinking Level Picker** in the status bar and select **High** (the filled circle). This tells the model to spend more time reasoning before it responds -- considering edge cases, planning the implementation order, and thinking through how changes in one layer affect another.

**Step 2: Send a detailed prompt**

In the Agent Panel, type this prompt:

```
Add due dates to the todo system. Include a date picker in the add/edit 
form, display the due date on each todo card, show an "Overdue" badge in 
red for past-due items, and add the ability to sort todos by due date.
```

**Step 3: Review the agent's plan**

Before the agent starts writing code, it will reason through the implementation. With High thinking, you'll see it consider:

- Adding a `due_date` column to the SQLite database (nullable, since existing todos don't have dates)
- Updating the Pydantic models in FastAPI (`TodoCreate`, `TodoUpdate`, `TodoResponse`)
- Modifying the CRUD endpoints to accept and return due dates
- Adding a sort parameter to the list endpoint
- Creating a date picker component in the React frontend
- Adding overdue detection logic (comparing `due_date` to the current date)
- Styling the overdue badge

The agent will likely modify these files:

- `backend/main.py` -- Database schema and API endpoints
- `frontend/src/App.tsx` -- Todo card display and form components
- `frontend/src/App.css` -- Styling for the date picker and overdue badge

**Step 4: Let the agent implement**

Approve the changes as the agent works through them. Watch how it handles the migration concern -- existing todos in the database don't have due dates, so the column needs to be nullable with a `NULL` default.

Once the agent finishes, test the feature:

```bash
# Restart the backend to pick up schema changes
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# The frontend should hot-reload automatically
```

Try adding a new todo with a due date set to yesterday -- you should see the red "Overdue" badge appear.

> 📖 **What just happened?** By using a higher thinking level, the agent had time to plan a coherent implementation across all three layers. A lower thinking level might have missed the nullable column requirement or forgotten to update the Pydantic response model. The extra reasoning time translates directly into fewer bugs and less back-and-forth.

> 💡 **Tip:** After implementing a complex feature, set thinking back to **Medium** for your next task. There's no need to keep it on High for everything -- save the deep reasoning for when you genuinely need it.

---

### Agent-Assisted Documentation

Every good project needs a README. Instead of writing one from scratch, let the agent generate it based on everything it knows about the project.

Send this prompt to the agent:

```
Generate a comprehensive README.md for the TaskFlow project. Include: 
project description, tech stack, setup instructions for both backend 
and frontend, API documentation for all endpoints, and screenshot 
placeholders.
```

The agent will create a README that covers:

- **Project overview** -- what TaskFlow is and what it does
- **Tech stack** -- FastAPI, SQLite, React, TypeScript, Vite
- **Setup instructions** -- step-by-step for both backend and frontend
- **API documentation** -- every endpoint with method, path, request body, and response format
- **Screenshot placeholders** -- where to add images of the running app

Review the generated README carefully. The agent has been working with this codebase throughout the tutorial, so it has deep context about the project structure, endpoints, and components. But you should still verify:

- Are the setup instructions accurate? Try following them in your head.
- Are all API endpoints listed? Check against `backend/main.py`.
- Are the descriptions clear for someone who hasn't taken this tutorial?

Make any corrections by either editing the file directly or asking the agent to fix specific sections.

> 💡 **Tip:** AI-generated documentation is a great starting point, but it's not a replacement for human review. The agent may assume setup steps that aren't obvious to a newcomer, or it might miss a recently added endpoint. Always review generated docs before publishing.

---

### Code Review with the Agent

One of the most valuable things an AI agent can do is review your code with fresh eyes. It can spot issues that you've become blind to after working on the same codebase for hours.

Set your thinking level to **High** for this -- you want thorough analysis. Then send:

```
Review the entire TaskFlow codebase for potential issues: security 
vulnerabilities, performance problems, missing error handling, and 
code quality. Prioritize by severity.
```

The agent will read through your backend and frontend code and produce a prioritized list of findings. Common issues it might flag:

**Security:**

- SQL injection risks (though SQLite with parameterized queries is generally safe)
- Missing input validation on API endpoints
- CORS configuration that's too permissive for production

**Performance:**

- Missing database indexes on frequently queried columns
- Frontend re-renders that could be optimized with `useMemo` or `useCallback`
- API endpoints that fetch more data than needed

**Error handling:**

- API endpoints that don't handle database errors gracefully
- Frontend code that doesn't show user-friendly error messages for failed requests
- Missing try/catch blocks around async operations

**Code quality:**

- Inconsistent naming conventions
- Functions that are too long and could be extracted
- Missing TypeScript types or overly broad `any` types

Review the findings and fix the most critical ones. You don't need to address everything -- focus on security issues and missing error handling first, then code quality if you have time.

For example, if the agent flags that your CORS settings allow all origins:

```python
# Before: Too permissive for production
app.add_middleware(CORSMiddleware, allow_origins=["*"])

# After: Restrict to your frontend's origin
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])
```

Or if it finds a missing error handler:

```python
@app.get("/todos/{todo_id}")
async def get_todo(todo_id: int):
    todo = db.get(todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo
```

Work through the top 3-5 issues the agent identifies. This kind of AI-assisted code review is something you can do on every project -- it's like having a senior developer look over your shoulder.

> 📖 **What just happened?** The agent reviewed your entire codebase systematically, something that would take a human reviewer significant time. It applied patterns from millions of codebases it was trained on to spot common pitfalls. This doesn't replace human code review -- but it catches the mechanical issues so human reviewers can focus on architecture, design, and business logic.

---

### Final Git Commit

Let's commit all the work from this chapter -- due dates, documentation, and code review fixes.

First, check what's changed:

```bash
git status
git diff --stat
```

Then commit everything:

```bash
git add -A
git commit -m "feat: add due dates, README documentation, and code review fixes

- Add due_date column to todos with date picker UI
- Add overdue badge and sort-by-date functionality
- Generate comprehensive README with API docs
- Fix security and error handling issues from code review"
```

> 💡 **Tip:** Writing good commit messages is a skill. The format above -- a short summary line, then a blank line, then bullet points with details -- is widely used and makes `git log` readable. The agent can also help you write commit messages if you ask it.

---

### Project Reflection

Take a moment to appreciate what you've built. Over the course of this tutorial, you created:

**Three distinct applications:**

- A static landing page with HTML, CSS, and JavaScript
- A FastAPI backend with SQLite persistence and a full REST API
- A React + TypeScript frontend with rich interactivity

**Using these Tide Code features:**

- The Dashboard for workspace management
- The file tree and multi-tab editor for code navigation
- The integrated terminal for running servers and commands
- The AI agent for code generation, debugging, and review
- Orchestration for complex, multi-step features
- Code intelligence for navigating symbols and understanding structure
- Skills for extending the agent's capabilities
- Sessions for managing long-running conversations
- Model selection and thinking levels for optimizing AI quality and cost
- The Command Palette and keyboard shortcuts for power-user efficiency
- Settings for customizing every aspect of the IDE

That's a comprehensive tour of a modern AI-powered development environment. The key takeaway isn't any single feature -- it's the workflow. Tide Code integrates AI assistance into every step of development, from initial scaffolding to final code review.

---

### What's Next: Continuing Your Tide Code Journey

This tutorial covered the fundamentals, but there's much more to explore:

**Explore the source code.** Tide Code is open source. Visit the repository at [https://github.com/narcofreccia/tide_code](https://github.com/narcofreccia/tide_code) to see how it's built. Reading the source of the tools you use is one of the best ways to level up as a developer.

**Read PROJECT.md.** The repository includes a detailed `PROJECT.md` file that explains the architecture -- how the Tauri backend, React frontend, and Pi agent work together. Understanding this architecture will help you get the most out of every feature.

**Build your own project from scratch.** The best way to internalize what you've learned is to start a new project and use orchestration from the beginning. Pick something you care about -- a personal website, a CLI tool, a game -- and let Tide Code help you build it.

**Install community skills.** The skills system is extensible. Look for community-contributed skills that add new capabilities to the agent -- code formatters, deployment helpers, testing frameworks, and more.

**Contribute to Tide Code.** Found a bug? Have an idea for a feature? Tide Code is open source and welcomes contributions. Start with the issues list on GitHub, or submit a pull request with your improvement.

---

*You started this tutorial as someone learning a new IDE. You're finishing it as a developer who understands how to leverage AI assistance throughout the entire development lifecycle -- from blank project to polished, reviewed, documented application. That's a skill that will serve you well regardless of which tools you use in the future.*

*Happy building.*

---

## Quick Reference Card

### Keyboard Shortcuts

| Shortcut     | Action                 |
| ------------ | ---------------------- |
| Ctrl+S       | Save file              |
| Ctrl+Shift+P | Command Palette        |
| Ctrl+Shift+F | Search files           |
| Ctrl+`       | Toggle terminal        |
| Ctrl+B       | Toggle file tree       |
| Ctrl+T       | New terminal           |
| Ctrl+W       | Close tab              |
| Ctrl+D       | Select next occurrence |

### Tide Code Features Covered

| Feature                    | Chapter |
| -------------------------- | ------- |
| Dashboard & Workspaces     | 1       |
| File Tree & Editor         | 1, 2    |
| Terminal & Split Panes     | 3, 6    |
| Multi-tab Editing          | 2, 4    |
| AI Agent (Pi)              | 5       |
| Orchestration Pipeline     | 7       |
| Code Intelligence          | 8       |
| Skills & Extensions        | 9       |
| Sessions & Context         | 10      |
| Model Selection & Thinking | 10      |
| Command Palette            | 11      |
| Settings & Themes          | 11      |
| CLI Command                | 11      |

---

*Built with Tide Code — the AI-powered IDE for developers who ship.*
