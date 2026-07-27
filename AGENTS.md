# raynorpat.com

Personal Hugo site deployed as an Azure Static Web App.

# General engineering

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Commands

| Action | Command |
|--------|---------|
| Dev server (live reload) | `hugo server` |
| Production build | `hugo --minify` |
| New post (draft) | `hugo new content posts/my-post.md` |

No build step, no JS framework, no tests, no linter, no typechecker.

## CI / Deploy

- Push to `master` triggers `.github/workflows/azure-static-web-app.yml`
- Hugo version pinned to `0.164.0` (non-extended)
- Build output goes to `public/` (gitignored)
- Azure SWA deploys from `public/` directly (`skip_app_build: true`)

## Conventions

- Post front matter: `title`, `date`, `description`; drafts use `draft: true`
- Archetype at `archetypes/posts.md`
- CSS uses design tokens (`--color-*`, `--space-*`, `--radius-*` in `static/css/tokens.css`)
- Font: self-hosted Public Sans (`static/fonts/public-sans-latin.woff2`)
- Data-driven pages read from `data/socials.yaml` and `data/projects.yaml`
- No Hugo modules or vendored themes — everything is in `layouts/`

## Committing Changes

- Always keep the commit messages short, human-readable, and descriptive.
- Start the commit line with whatever subsystem you are working on, e.g. "opengldrv: ", "core: ", "editor: ", etc.
- Describe what the changes actually do instead of listing the changed files. Keep commit messages as one to two lines.
- Do not add any metadata to commits.
