# web

Public website of [raynorpat.com](https://raynorpat.com), built with [Hugo](https://gohugo.io) and deployed as an Azure Static Web App.

## Structure

- `content/posts/` — blog posts, one Markdown file per post (`title`, `date`, `description` front matter)
- `layouts/` — page templates (home hero, article/archive pages, socials page, 404)
- `static/css/`, `static/fonts/` — hand-written CSS design tokens and a self-hosted Public Sans font (no build step, no JS)
- `data/socials.yaml` — social links shared by the header and the `/socials/` page
- `hugo.toml` — site config

## Local development

Install Hugo (non-extended is enough, no Sass is used):

```
scoop install hugo
```

Run a local dev server with live reload:

```
hugo server
```

Add a new post:

```
hugo new content posts/my-new-post.md
```

Build the production output into `public/`:

```
hugo build
```

## Deployment

Pushing to `master` triggers [.github/workflows/azure-static-web-app.yml](.github/workflows/azure-static-web-app.yml), which builds the site with a pinned Hugo version and deploys the prebuilt `public/` output to Azure Static Web Apps.
