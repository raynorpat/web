# Personal Site Refactor: Hugo-Based Blog

## Context

The current site (`index.html`, `assets/`) is a single-page bio built on the
"Eventually" HTML5 UP template: an avatar/name header and a footer of social
links. It's deployed as a static upload (no build step) to Azure Static Web
Apps via `.github/workflows/azure-static-web-app.yml`.

The goal is to rebuild the site in the spirit of
[toolmantim.com-old](https://github.com/toolmantim/toolmantim.com-old) — a
file-based blog where publishing an article means adding a file to the repo
and deploying, with no admin UI or database — but without its Ruby/Sinatra
stack, and simple enough to build and deploy cleanly as an Azure Static Web
App.

## Goals

- Full blog: home feed, individual article pages, a full chronological
  archive, and an RSS feed — built from Markdown files in the repo.
- Carry over the existing bio content (avatar, name, social links) as a
  persistent header shown on every page, rather than a single standalone
  page.
- Match the attached design system (colors, typography, spacing, radii)
  rather than the old site's 2007-era visuals.
- Support dark mode automatically via `prefers-color-scheme` (no manual
  toggle).
- Keep the toolchain minimal: no Node/Ruby dependency trees, no theme
  submodules, no CMS.

## Non-goals (v1)

- Photo gallery section (toolmantim's old site had one; explicitly deferred).
- Tags/categories/taxonomies.
- Manual dark/light toggle.
- Migrating any existing external writing — the blog starts empty.

These are all straightforward to add later without restructuring the site,
since Hugo supports taxonomies and additional sections natively.

## Architecture

**Static site generator: Hugo.** A single Go binary — no `node_modules`, no
Ruby gems, no git submodules. The custom theme lives directly in the repo
root (`layouts/`, `assets/`, `static/`) rather than as a separate theme
package, since this is a single-purpose personal site with no reuse case.

## Directory structure

```
/
├── hugo.toml                  # site config, base URL, pagination, output formats
├── archetypes/posts.md        # front-matter template for `hugo new`
├── content/
│   └── posts/                 # one .md file per article, empty to start
├── layouts/
│   ├── _default/baseof.html   # shared <head>, header, footer shell
│   ├── index.html             # home: paginated recent posts
│   ├── posts/list.html        # archive: full chronological list, grouped by year
│   ├── posts/single.html      # article page
│   ├── partials/header.html   # avatar, name, nav, social icons (persistent)
│   ├── partials/footer.html   # copyright
│   └── 404.html
├── assets/css/
│   ├── tokens.css             # CSS variables from the design system
│   └── main.css
├── static/
│   ├── images/                # avatar, favicon
│   └── fonts/                 # self-hosted Public Sans woff2 (400/500/600/700)
└── .github/workflows/azure-static-web-app.yml
```

The current `assets/` (HTML5 UP template CSS/JS) and `images/bg0*.jpg` are
removed — they belong to the old template being replaced.

## Content model

Articles are plain Markdown files under `content/posts/` with front matter:

- `title`
- `date`
- `description`
- `slug` (optional; Hugo derives one from the filename if omitted)

No tags/categories in v1.

## Pages

- **Home (`/`)** — persistent header (avatar, "Patrick Raynor", nav, social
  icons: Twitter, GitHub, Flickr, Instagram, Resume, Email) + paginated
  recent-posts feed (10 per page).
- **Article (`/posts/<slug>/`)** — single post, same persistent header,
  prev/next links.
- **Archive (`/posts/`)** — every post ever published, grouped by year, on
  one page with no pagination, for fast scanning of history.
- **404** — served automatically by Azure Static Web Apps on unmatched
  routes.
- **RSS (`/index.xml`) and sitemap (`/sitemap.xml`)** — Hugo's default
  output formats, enabled out of the box.

## Design system → CSS

Translated directly from the provided style guide into CSS custom
properties, switched via `prefers-color-scheme: dark`:

**Colors**

| Token | Light | Dark |
|---|---|---|
| Page | `#f5f5f3` | `#16161a` |
| Surface | `#ffffff` | `#1e1e23` |
| Border | `#e5e5e3` | `#2d2d33` |
| Text | `#111111` | `#f1f1ee` |
| Text 2 | `#888780` | `#97978f` |

Semantic: Info `#6470E5`, Notice `#9B6BEF`, Success `#1D9E75`,
Warning `#EF9F27`, Danger `#E24B4A`.

**Typography** — `'Public Sans', -apple-system, BlinkMacSystemFont,
'Segoe UI', sans-serif`, self-hosted as woff2 (weights 400/500/600/700) to
avoid an external Google Fonts request.

| Scale | Size | Weight |
|---|---|---|
| Display | 32px | 700 |
| Heading | 22px | 600 |
| Subheading | 16px | 600 |
| Body | 15px | 400 |
| Label | 13px | 500 |

**Spacing** — 4px-based scale: 4, 8, 12, 16, 20, 24, 32, 48.

**Radii** — Badge 6px, Control 8px, Card 16px, Pill 999px.

Plain CSS, no preprocessor or build step — the token set is small enough
that variables alone keep it maintainable.

## Deployment

Update `.github/workflows/azure-static-web-app.yml` to:

1. Install a pinned Hugo version (extended edition not required — no Sass
   compilation).
2. Run `hugo build` to produce `public/`.
3. Deploy via `Azure/static-web-apps-deploy@v1` with `skip_app_build: true`
   and `app_location: "public"`, uploading the prebuilt output rather than
   relying on Azure's auto-detected Oryx build.

This keeps the exact Hugo version reproducible between local development and
CI, rather than depending on whatever version Azure's build image happens to
bundle.

## Testing / verification

- `hugo server -D` locally to preview drafts and confirm layouts render
  correctly in both light and dark color schemes.
- `hugo build` locally to confirm the production build succeeds and
  `public/` contains the expected pages (home, at least one sample article,
  archive, 404, RSS, sitemap) before relying on CI.
- After deploy, manually check the live Azure Static Web App URL for the
  same set of pages, plus dark-mode rendering via OS/browser preference.
