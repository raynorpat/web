# Site Identity & Polish

## Summary

Four independent, low-effort improvements to raynorpat.com.

## Changes

### 1. Favicon
- Inline SVG favicon using the site's brand color (`#6470E5` / `--color-info`).
- Rendered as a monogram "P" on a rounded square.
- Added via `<link rel="icon">` in `head.html`.

### 2. Self-host avatar
- Download GitHub avatar (`avatars3.githubusercontent.com/u/17457?s=460&v=4`) to `static/images/avatar.jpg`.
- Update image `src` in `layouts/partials/header.html`, `layouts/index.html`, and `layouts/_default/socials.html` to `/images/avatar.jpg`.

### 3. Skip-to-content link
- Add `<a href="#main" class="skip-link">Skip to content</a>` as first child of `<body>` in `layouts/_default/baseof.html`.
- Add CSS for `.skip-link` — visually hidden by default, becomes visible on keyboard focus.
- Add `id="main"` to `<main>` element in `baseof.html`.

### 4. Default OG image
- Add `images: ["/images/avatar.jpg"]` to `[params]` in `hugo.toml`.
- Hugo's built-in `opengraph.html` template picks this up as the fallback `og:image`.

## Files touched

- `layouts/partials/head.html` — favicon link
- `layouts/_default/baseof.html` — skip link + main id
- `static/css/main.css` — skip-link styles
- `static/images/avatar.jpg` — new file (downloaded)
- `layouts/partials/header.html` — avatar path
- `layouts/index.html` — avatar path
- `layouts/_default/socials.html` — avatar path
- `hugo.toml` — default OG image

## Risk

None. Visual changes only (favicon, avatar path). Skip link is hidden by default.
