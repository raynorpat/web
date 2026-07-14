# Site Identity & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task.

**Goal:** Add favicon, self-host avatar, skip-to-content link, and default OG image.

**Architecture:** All changes are independent — no shared state or sequencing dependencies.

**Tech Stack:** Hugo, vanilla HTML/CSS

## Global Constraints

- Hugo v0.164.0 (non-extended)
- All CSS uses design tokens from `static/css/tokens.css`
- No build step, no JS framework

---

### Task 1: Favicon

**Files:**
- Modify: `layouts/partials/head.html:7`

**Interfaces:**
- Consumes: nothing
- Produces: inline SVG favicon in `<head>` of every page

- [ ] **Step 1: Add favicon link to head.html**

Insert after the description meta tag:

```
{{ template "_internal/twitter_cards.html" . }}
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%236470E5'/%3E%3Ctext x='50' y='68' text-anchor='middle' fill='white' font-size='60' font-family='sans-serif' font-weight='700'%3EP%3C/text%3E%3C/svg%3E">
```

- [ ] **Step 2: Commit**

```
git add layouts/partials/head.html
git commit -m "site: add favicon"
```

### Task 2: Self-host avatar

**Files:**
- Create: `static/images/avatar.jpg`
- Modify: `layouts/partials/header.html:3`
- Modify: `layouts/index.html:3`
- Modify: `layouts/_default/socials.html:4`

**Interfaces:**
- Consumes: nothing
- Produces: locally-served avatar replacing GitHub hotlink

- [ ] **Step 1: Download avatar from GitHub**

```
curl -sL -o static/images/avatar.jpg "https://avatars3.githubusercontent.com/u/17457?s=460&v=4"
```

- [ ] **Step 2: Update header.html**

Replace `src="https://avatars3.githubusercontent.com/u/17457?s=460&v=4"` with `src="/images/avatar.jpg"` in `layouts/partials/header.html`.

- [ ] **Step 3: Update index.html**

Same replacement in `layouts/index.html`.

- [ ] **Step 4: Update socials.html**

Same replacement in `layouts/_default/socials.html`.

- [ ] **Step 5: Commit**

```
git add static/images/avatar.jpg layouts/partials/header.html layouts/index.html layouts/_default/socials.html
git commit -m "site: self-host avatar from local image"
```

### Task 3: Skip-to-content link

**Files:**
- Modify: `layouts/_default/baseof.html:6`
- Modify: `static/css/main.css` (append skip-link styles)

**Interfaces:**
- Consumes: nothing
- Produces: accessible skip link on every page

- [ ] **Step 1: Add skip link and main id to baseof.html**

Replace `<body>` block:

```html
<body>
  <a href="#main" class="skip-link">Skip to content</a>
  {{ if not .IsHome }}{{ partial "header.html" . }}{{ end }}
  <main class="content" id="main">
    {{ block "main" . }}{{ end }}
  </main>
```

- [ ] **Step 2: Add skip-link CSS to main.css**

Append before the final newline:

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--color-info);
  color: #fff;
  border-radius: var(--radius-control);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-label);
  text-decoration: none;
  z-index: 100;
}
.skip-link:focus {
  top: var(--space-2);
}
```

- [ ] **Step 3: Commit**

```
git add layouts/_default/baseof.html static/css/main.css
git commit -m "site: add skip-to-content link for accessibility"
```

### Task 4: Default OG image

**Files:**
- Modify: `hugo.toml:9`

**Interfaces:**
- Consumes: avatar image from Task 2 (must be committed first)
- Produces: `og:image` meta tag on every page via Hugo's internal template

- [ ] **Step 1: Add images param to hugo.toml**

```
[params]
  author = "Patrick Raynor"
  description = "Patrick Raynor's personal site and blog"
  images = ["/images/avatar.jpg"]
```

(insert `images` line under `description`)

- [ ] **Step 2: Verify with build**

```
hugo --minify && grep 'og:image' public/index.html
```

Expected: `<meta property="og:image" content="https://raynorpat.com/images/avatar.jpg">`

- [ ] **Step 3: Commit**

```
git add hugo.toml
git commit -m "site: add default OG image for link previews"
```

### Task 5: Verify full build

- [ ] **Step 1: Full production build**

```
hugo --minify
```

Expected: exit code 0, no errors

- [ ] **Step 2: Spot-check key pages**

```
grep -c 'og:image' public/index.html public/posts/refreshed-2026/index.html public/socials/index.html
grep -c 'skip-link' public/index.html public/posts/refreshed-2026/index.html public/socials/index.html
grep 'favicon' public/index.html
```

Expected: each page has og:image, skip-link, and favicon

- [ ] **Step 3: Final commit**

```
git add docs/superpowers/plans/2026-07-13-site-identity-polish.md docs/superpowers/specs/2026-07-13-site-identity-polish-design.md
git commit -m "docs: add design spec and implementation plan"
```
