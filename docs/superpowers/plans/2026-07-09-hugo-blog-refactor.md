# Hugo Blog Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-page HTML5-UP bio site with a Hugo-based static blog (home feed, article pages, full archive, RSS/sitemap), styled from the provided design system, deployed to Azure Static Web Apps.

**Architecture:** Hugo (single Go binary, no Node/Ruby toolchain) reads Markdown files from `content/posts/` and Go templates from `layouts/`, emitting static HTML to `public/`. CI installs a pinned Hugo version, runs `hugo build`, and uploads the prebuilt `public/` folder to Azure Static Web Apps directly (no Oryx auto-build).

**Tech Stack:** Hugo 0.163.3 (non-extended — no Sass compilation needed), plain CSS (no preprocessor), self-hosted Public Sans variable font, GitHub Actions, Azure Static Web Apps.

## Global Constraints

- Hugo version pinned to **0.163.3** everywhere (local dev and CI) — non-extended edition, since no Sass/SCSS compilation is used.
- No Node.js, Ruby, or npm dependency tree anywhere in the repo.
- CSS is hand-written and served as-is from `static/css/` (no Hugo Pipes/asset fingerprinting, no preprocessor).
- Public Sans is self-hosted from `static/fonts/`, not loaded from a CDN.
- Dark mode is automatic via `prefers-color-scheme` only — no manual toggle, no JS.
- Content front matter is limited to `title`, `date`, `description` — no tags/categories.
- No photo gallery, no content migration — `content/posts/` starts (and, after verification, ends) empty in this plan.

---

### Task 1: Remove old site and scaffold the Hugo skeleton

**Files:**
- Delete: `index.html`, `assets/css/main.css`, `assets/js/main.js`, `images/bg01.jpg`, `images/bg02.jpg`, `images/bg03.jpg`
- Create: `hugo.toml`
- Create: `layouts/_default/baseof.html`
- Create: `layouts/partials/head.html`
- Create: `layouts/partials/header.html` (stub, replaced in Task 3)
- Create: `layouts/partials/footer.html` (stub, replaced in Task 4)
- Create: `layouts/index.html` (stub, replaced in Task 7)

**Interfaces:**
- Produces: `hugo.toml` site config consumed by every later task's `hugo build`. `layouts/_default/baseof.html` defines the `{{ block "main" . }}` slot every page template (`index.html`, `layouts/posts/single.html`, `layouts/posts/list.html`, `layouts/404.html`) fills via `{{ define "main" }}`.

- [ ] **Step 1: Verify Hugo is installed locally**

Run: `hugo version`
Expected: a version string. If Hugo is not installed, run `scoop install hugo` first (this machine already has the `main` Scoop bucket, which carries `hugo` 0.163.3), then re-run `hugo version` and confirm it reports `v0.163.3`.

- [ ] **Step 2: Remove the old template files**

```bash
git rm index.html assets/css/main.css assets/js/main.js images/bg01.jpg images/bg02.jpg images/bg03.jpg
rmdir assets/css assets/js assets images 2>/dev/null || true
```

- [ ] **Step 3: Create `hugo.toml`**

```toml
baseURL = "https://raynorpat.com/"
languageCode = "en-us"
title = "Patrick Raynor"

[params]
  author = "Patrick Raynor"
  description = "Patrick Raynor's personal site and blog"

[pagination]
  pagerSize = 10

[outputs]
  home = ["HTML", "RSS"]
  section = ["HTML", "RSS"]
```

- [ ] **Step 4: Create `layouts/partials/head.html`**

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ if .IsHome }}{{ .Site.Title }}{{ else }}{{ .Title }} &middot; {{ .Site.Title }}{{ end }}</title>
<meta name="description" content="{{ if .Description }}{{ .Description }}{{ else }}{{ .Site.Params.description }}{{ end }}">
```

- [ ] **Step 5: Create stub `layouts/partials/header.html` and `layouts/partials/footer.html`**

`layouts/partials/header.html`:
```html
<header></header>
```

`layouts/partials/footer.html`:
```html
<footer></footer>
```

- [ ] **Step 6: Create `layouts/_default/baseof.html`**

```html
<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode }}">
<head>
  {{ partial "head.html" . }}
</head>
<body>
  {{ partial "header.html" . }}
  <main class="content">
    {{ block "main" . }}{{ end }}
  </main>
  {{ partial "footer.html" . }}
</body>
</html>
```

- [ ] **Step 7: Create stub `layouts/index.html`**

```html
{{ define "main" }}
<p>Site scaffold OK</p>
{{ end }}
```

- [ ] **Step 8: Build and verify**

Run:
```bash
rm -rf public
hugo build
test -f public/index.html && echo "index.html OK"
test -f public/sitemap.xml && echo "sitemap.xml OK"
grep -q "Site scaffold OK" public/index.html && echo "stub content OK"
grep -q "<title>Patrick Raynor</title>" public/index.html && echo "title OK"
```
Expected output: `index.html OK`, `sitemap.xml OK`, `stub content OK`, `title OK`, with no Hugo error output above it.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Replace HTML5-UP template with Hugo site skeleton"
```

---

### Task 2: Design tokens CSS and self-hosted font

**Files:**
- Create: `static/css/tokens.css`
- Create: `static/css/main.css`
- Create: `static/fonts/public-sans-latin.woff2`
- Modify: `layouts/partials/head.html`

**Interfaces:**
- Produces: CSS custom properties (`--color-page`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-2`, `--color-info`, `--color-notice`, `--color-success`, `--color-warning`, `--color-danger`, `--font-family`, `--font-size-*`/`--font-weight-*` for `display`/`heading`/`subheading`/`body`/`label`, `--space-1` through `--space-8`, `--radius-badge`/`--radius-control`/`--radius-card`/`--radius-pill`) that every later task's CSS additions reference. Base selectors `body`, `a`, `h1`, `h2`, `.content` styled here.

- [ ] **Step 1: Download the self-hosted font**

```bash
mkdir -p static/fonts
curl -sL -o static/fonts/public-sans-latin.woff2 "https://fonts.gstatic.com/s/publicsans/v21/ijwRs572Xtc6ZYQws9YVwnNGfJ4.woff2"
```

Verify: `file static/fonts/public-sans-latin.woff2` reports `Web Open Font Format (Version 2)`. This is Public Sans's variable-weight latin subset (confirmed identical file is served by Google Fonts for weights 400/500/600/700 — one file covers the full weight range via font variations), so a single download covers every weight this design uses.

- [ ] **Step 2: Create `static/css/tokens.css`**

```css
:root {
  --color-page: #f5f5f3;
  --color-surface: #ffffff;
  --color-border: #e5e5e3;
  --color-text: #111111;
  --color-text-2: #888780;

  --color-info: #6470E5;
  --color-notice: #9B6BEF;
  --color-success: #1D9E75;
  --color-warning: #EF9F27;
  --color-danger: #E24B4A;

  --font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --font-size-display: 32px;
  --font-weight-display: 700;
  --font-size-heading: 22px;
  --font-weight-heading: 600;
  --font-size-subheading: 16px;
  --font-weight-subheading: 600;
  --font-size-body: 15px;
  --font-weight-body: 400;
  --font-size-label: 13px;
  --font-weight-label: 500;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 48px;

  --radius-badge: 6px;
  --radius-control: 8px;
  --radius-card: 16px;
  --radius-pill: 999px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-page: #16161a;
    --color-surface: #1e1e23;
    --color-border: #2d2d33;
    --color-text: #f1f1ee;
    --color-text-2: #97978f;
  }
}
```

- [ ] **Step 3: Create `static/css/main.css`**

```css
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/public-sans-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/fonts/public-sans-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/fonts/public-sans-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/public-sans-latin.woff2') format('woff2');
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-page);
  color: var(--color-text);
  font-family: var(--font-family);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-body);
  line-height: 1.5;
}

a {
  color: var(--color-info);
}

h1 {
  font-size: var(--font-size-display);
  font-weight: var(--font-weight-display);
}

h2 {
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-heading);
}

.content {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}
```

- [ ] **Step 4: Wire the stylesheets into `layouts/partials/head.html`**

Append to the end of `layouts/partials/head.html`:
```html
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/main.css">
```

- [ ] **Step 5: Build and verify**

Run:
```bash
rm -rf public
hugo build
test -f public/css/tokens.css && echo "tokens.css OK"
test -f public/css/main.css && echo "main.css OK"
test -f public/fonts/public-sans-latin.woff2 && echo "font OK"
grep -q '/css/tokens.css' public/index.html && echo "tokens link OK"
grep -q '/css/main.css' public/index.html && echo "main link OK"
```
Expected: all five `OK` lines print.

- [ ] **Step 6: Commit**

```bash
git add static layouts/partials/head.html
git commit -m "Add design-system CSS tokens and self-hosted Public Sans font"
```

---

### Task 3: Header partial with persistent bio, nav, and social links

**Files:**
- Modify: `layouts/partials/header.html`
- Modify: `static/css/main.css`

**Interfaces:**
- Consumes: `--space-*`, `--radius-pill`, `--font-size-subheading`/`--font-weight-subheading`, `--font-size-label`/`--font-weight-label`, `--color-border`, `--color-text-2` from `tokens.css` (Task 2).
- Produces: `.site-header` markup present on every page via `baseof.html` (Task 1).

- [ ] **Step 1: Replace `layouts/partials/header.html`**

```html
<header class="site-header">
  <a href="/" class="site-header__identity">
    <img class="avatar" src="https://avatars3.githubusercontent.com/u/17457?s=460&v=4" alt="Photo of Patrick Raynor" width="48" height="48">
    <span class="site-header__name">Patrick Raynor</span>
  </a>
  <nav class="site-header__nav">
    <a href="/">Home</a>
    <a href="/posts/">Archive</a>
  </nav>
  <ul class="site-header__icons">
    <li><a href="https://twitter.com/raynorpat">Twitter</a></li>
    <li><a href="https://facebook.com/raynorpat">Facebook</a></li>
    <li><a href="https://www.flickr.com/photos/136097076@N05">Flickr</a></li>
    <li><a href="https://instagram.com/raynorpat">Instagram</a></li>
    <li><a href="https://github.com/raynorpat">GitHub</a></li>
    <li><a href="https://docs.google.com/document/d/1-7Sye63MNtBaw7rI6BS8jeQkrT8gLfCrKhR5L9RIcrM/edit?usp=sharing">Resume</a></li>
    <li><a href="mailto:raynorpat@raynorpat.com">Email</a></li>
  </ul>
</header>
```

- [ ] **Step 2: Append header styles to `static/css/main.css`**

```css
.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  max-width: 640px;
  margin: 0 auto;
}

.site-header__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  text-decoration: none;
  color: inherit;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
}

.site-header__name {
  font-size: var(--font-size-subheading);
  font-weight: var(--font-weight-subheading);
}

.site-header__nav {
  display: flex;
  gap: var(--space-4);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-label);
}

.site-header__icons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--font-size-label);
  color: var(--color-text-2);
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
rm -rf public
hugo build
grep -q 'class="site-header"' public/index.html && echo "header OK"
grep -q 'Patrick Raynor' public/index.html && echo "name OK"
grep -q 'https://twitter.com/raynorpat' public/index.html && echo "twitter OK"
grep -q 'https://github.com/raynorpat' public/index.html && echo "github OK"
grep -q 'https://www.flickr.com/photos/136097076@N05' public/index.html && echo "flickr OK"
grep -q 'https://instagram.com/raynorpat' public/index.html && echo "instagram OK"
grep -q 'mailto:raynorpat@raynorpat.com' public/index.html && echo "email OK"
```
Expected: all seven `OK` lines print.

- [ ] **Step 4: Commit**

```bash
git add layouts/partials/header.html static/css/main.css
git commit -m "Add persistent site header with bio and social links"
```

---

### Task 4: Footer partial

**Files:**
- Modify: `layouts/partials/footer.html`
- Modify: `static/css/main.css`

**Interfaces:**
- Consumes: `--space-6`, `--space-4`, `--color-text-2`, `--font-size-label` from `tokens.css` (Task 2).

- [ ] **Step 1: Replace `layouts/partials/footer.html`**

```html
<footer class="site-footer">
  <p>&copy; {{ now.Format "2006" }} Patrick Raynor</p>
</footer>
```

- [ ] **Step 2: Append footer styles to `static/css/main.css`**

```css
.site-footer {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-2);
  font-size: var(--font-size-label);
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
rm -rf public
hugo build
grep -q 'class="site-footer"' public/index.html && echo "footer OK"
grep -oE '&copy; [0-9]{4} Patrick Raynor' public/index.html && echo "copyright OK"
```
Expected: `footer OK`, then the matched copyright line printed, then `copyright OK`.

- [ ] **Step 4: Commit**

```bash
git add layouts/partials/footer.html static/css/main.css
git commit -m "Add site footer"
```

---

### Task 5: Post content model and single-article template

**Files:**
- Create: `archetypes/posts.md`
- Create: `layouts/posts/single.html`
- Create: `content/posts/hello-world.md` (temporary — removed in Task 9)
- Modify: `static/css/main.css`

**Interfaces:**
- Consumes: front matter fields `title`, `date`, `description` (Global Constraints).
- Produces: `.RelPermalink` pages under `/posts/<slug>/` that Task 6 (archive) and Task 7 (home) link to.

- [ ] **Step 1: Create `archetypes/posts.md`**

```markdown
---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
description: ""
draft: true
---

```

- [ ] **Step 2: Create `layouts/posts/single.html`**

```html
{{ define "main" }}
<article class="post">
  <h1 class="post__title">{{ .Title }}</h1>
  <p class="post__date"><time datetime="{{ .Date.Format "2006-01-02" }}">{{ .Date.Format "January 2, 2006" }}</time></p>
  <div class="post__body">
    {{ .Content }}
  </div>
  <nav class="post__pager">
    {{ with .PrevInSection }}<a href="{{ .RelPermalink }}" rel="prev">&larr; {{ .Title }}</a>{{ end }}
    {{ with .NextInSection }}<a href="{{ .RelPermalink }}" rel="next">{{ .Title }} &rarr;</a>{{ end }}
  </nav>
</article>
{{ end }}
```

- [ ] **Step 3: Create the temporary test post `content/posts/hello-world.md`**

```markdown
---
title: "Hello World"
date: 2024-01-15
description: "The first post on the rebuilt site."
---

This is a test post used to verify the Hugo post templates render correctly. It is removed once every template that depends on post content has been verified.
```

- [ ] **Step 4: Append post styles to `static/css/main.css`**

```css
.post__date {
  color: var(--color-text-2);
  font-size: var(--font-size-label);
}

.post__pager {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-7);
  font-size: var(--font-size-label);
}
```

- [ ] **Step 5: Build and verify**

Run:
```bash
rm -rf public
hugo build
test -f public/posts/hello-world/index.html && echo "post page OK"
grep -q 'Hello World' public/posts/hello-world/index.html && echo "title OK"
grep -q 'January 15, 2024' public/posts/hello-world/index.html && echo "date OK"
grep -q 'test post used to verify' public/posts/hello-world/index.html && echo "body OK"
```
Expected: all four `OK` lines print.

- [ ] **Step 6: Commit**

```bash
git add archetypes/posts.md layouts/posts/single.html content/posts/hello-world.md static/css/main.css
git commit -m "Add post content model and single-article template"
```

---

### Task 6: Archive template grouped by year

**Files:**
- Create: `layouts/posts/list.html`
- Create: `content/posts/an-earlier-post.md` (temporary — removed in Task 9)
- Modify: `static/css/main.css`

**Interfaces:**
- Consumes: `.Pages.GroupByDate "2006"` over the `posts` section (Hugo built-in), `layouts/posts/single.html` output pages (Task 5).

- [ ] **Step 1: Create the second temporary test post `content/posts/an-earlier-post.md`**

```markdown
---
title: "An Earlier Post"
date: 2023-06-01
description: "A second test post in a different year, for verifying archive grouping."
---

This is a second test post used to verify the archive template groups posts by year correctly.
```

- [ ] **Step 2: Create `layouts/posts/list.html`**

```html
{{ define "main" }}
<h1>Archive</h1>
{{ range .Pages.GroupByDate "2006" }}
  <section class="archive-year">
    <h2>{{ .Key }}</h2>
    <ul>
      {{ range .Pages }}
      <li>
        <a href="{{ .RelPermalink }}">{{ .Title }}</a>
        <time datetime="{{ .Date.Format "2006-01-02" }}">{{ .Date.Format "Jan 2" }}</time>
      </li>
      {{ end }}
    </ul>
  </section>
{{ else }}
  <p>No posts yet.</p>
{{ end }}
{{ end }}
```

- [ ] **Step 3: Append archive styles to `static/css/main.css`**

```css
.archive-year h2 {
  margin-top: var(--space-7);
}

.archive-year ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.archive-year li {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
```

- [ ] **Step 4: Build and verify**

Run:
```bash
rm -rf public
hugo build
test -f public/posts/index.html && echo "archive page OK"
grep -q '<h2>2024</h2>' public/posts/index.html && echo "2024 group OK"
grep -q '<h2>2023</h2>' public/posts/index.html && echo "2023 group OK"
grep -q 'Hello World' public/posts/index.html && echo "post 1 listed OK"
grep -q 'An Earlier Post' public/posts/index.html && echo "post 2 listed OK"
```
Expected: all five `OK` lines print.

- [ ] **Step 5: Commit**

```bash
git add layouts/posts/list.html content/posts/an-earlier-post.md static/css/main.css
git commit -m "Add archive template grouped by year"
```

---

### Task 7: Home page with paginated recent-posts feed

**Files:**
- Modify: `layouts/index.html`
- Modify: `static/css/main.css`

**Interfaces:**
- Consumes: `.Site.RegularPages`, `.Paginate`, Hugo's built-in `"_internal/pagination.html"` template, `hugo.toml`'s `[pagination] pagerSize = 10` (Task 1).
- Produces: the home page (`/`) and its RSS feed (`/index.xml`), replacing the Task 1 stub.

- [ ] **Step 1: Replace `layouts/index.html`**

```html
{{ define "main" }}
<h1>{{ .Site.Title }}</h1>
{{ $posts := where .Site.RegularPages "Section" "posts" }}
{{ $paginator := .Paginate $posts }}
{{ if $paginator.Pages }}
<ul class="post-list">
  {{ range $paginator.Pages }}
  <li>
    <a href="{{ .RelPermalink }}">{{ .Title }}</a>
    <time datetime="{{ .Date.Format "2006-01-02" }}">{{ .Date.Format "Jan 2, 2006" }}</time>
    {{ if .Description }}<p>{{ .Description }}</p>{{ end }}
  </li>
  {{ end }}
</ul>
{{ template "_internal/pagination.html" . }}
{{ else }}
<p>No posts yet &mdash; check back soon.</p>
{{ end }}
{{ end }}
```

- [ ] **Step 2: Append home-feed styles to `static/css/main.css`**

```css
.post-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.post-list li {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-border);
}

.post-list time {
  color: var(--color-text-2);
  font-size: var(--font-size-label);
}
```

- [ ] **Step 3: Build and verify home page and RSS feed**

Run:
```bash
rm -rf public
hugo build
grep -q 'class="post-list"' public/index.html && echo "post list OK"
grep -q 'Hello World' public/index.html && echo "post 1 on home OK"
grep -q 'An Earlier Post' public/index.html && echo "post 2 on home OK"
test -f public/index.xml && echo "rss file OK"
grep -q 'Hello World' public/index.xml && echo "rss item OK"
```
Expected: all five `OK` lines print.

- [ ] **Step 4: Commit**

```bash
git add layouts/index.html static/css/main.css
git commit -m "Add paginated recent-posts home feed"
```

---

### Task 8: 404 page

**Files:**
- Create: `layouts/404.html`

**Interfaces:**
- None consumed beyond `baseof.html` (Task 1). Azure Static Web Apps automatically serves `public/404.html` for unmatched routes with no extra configuration.

- [ ] **Step 1: Create `layouts/404.html`**

```html
{{ define "main" }}
<h1>Page not found</h1>
<p>Sorry, that page doesn't exist. <a href="/">Go home</a>.</p>
{{ end }}
```

- [ ] **Step 2: Build and verify**

Run:
```bash
rm -rf public
hugo build
test -f public/404.html && echo "404.html OK"
grep -q 'Page not found' public/404.html && echo "404 content OK"
```
Expected: `404.html OK`, `404 content OK`.

- [ ] **Step 3: Commit**

```bash
git add layouts/404.html
git commit -m "Add custom 404 page"
```

---

### Task 9: Remove temporary sample posts and verify the zero-post edge case

**Files:**
- Delete: `content/posts/hello-world.md`, `content/posts/an-earlier-post.md`
- Create: `content/posts/.gitkeep`

**Interfaces:**
- None — this task only proves the templates from Tasks 5-7 degrade gracefully with zero posts, per the "start empty" requirement in Global Constraints.

- [ ] **Step 1: Remove the temporary posts, keep the directory tracked**

```bash
git rm content/posts/hello-world.md content/posts/an-earlier-post.md
touch content/posts/.gitkeep
git add content/posts/.gitkeep
```

- [ ] **Step 2: Build and verify the empty-content state**

Run:
```bash
rm -rf public
hugo build
echo "exit code: $?"
grep -q 'No posts yet' public/posts/index.html && echo "archive empty state OK"
grep -q 'No posts yet' public/index.html && echo "home empty state OK"
test -f public/index.xml && echo "rss still generated OK"
```
Expected: `exit code: 0` (no template errors from ranging over zero pages), `archive empty state OK`, `home empty state OK`, `rss still generated OK`.

- [ ] **Step 3: Commit**

```bash
git commit -m "Remove temporary sample posts, verify empty-blog rendering"
```

---

### Task 10: Update the deployment workflow and final verification

**Files:**
- Modify: `.github/workflows/azure-static-web-app.yml`

**Interfaces:**
- None — this is the last task; it wires CI to build what Tasks 1-9 produced and re-verifies the whole site builds clean.

- [ ] **Step 1: Replace `.github/workflows/azure-static-web-app.yml`**

```yaml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches:
      - master
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - master

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy Job
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.163.3'
          extended: false
      - name: Build with Hugo
        run: hugo --minify
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "public"
          api_location: ""
          output_location: ""
          skip_app_build: true

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close Pull Request Job
    steps:
      - name: Close Pull Request
        id: closepullrequest
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: "close"
```

- [ ] **Step 2: Verify the workflow YAML is well-formed**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/azure-static-web-app.yml')); print('YAML OK')"`
Expected: `YAML OK`

- [ ] **Step 3: Final clean-build verification of the whole site**

Run:
```bash
rm -rf public
hugo build
test -f public/index.html && echo "home OK"
test -f public/posts/index.html && echo "archive OK"
test -f public/404.html && echo "404 OK"
test -f public/index.xml && echo "rss OK"
test -f public/sitemap.xml && echo "sitemap OK"
test -f public/css/tokens.css && echo "tokens OK"
test -f public/css/main.css && echo "main.css OK"
test -f public/fonts/public-sans-latin.woff2 && echo "font OK"
```
Expected: all eight `OK` lines print, with no Hugo build errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/azure-static-web-app.yml
git commit -m "Build with Hugo in CI and deploy the prebuilt public/ output"
```
