# Production Google Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load Google Analytics measurement ID `G-DD9FSCLZD7` on every production HTML page while excluding it from development builds.

**Architecture:** Add the supplied Google tag to the existing shared Hugo head partial. Guard the complete tag with Hugo's built-in `hugo.IsProduction` condition so the build environment controls inclusion without a new configuration value.

**Tech Stack:** Hugo templates, HTML, Google Analytics 4 `gtag.js`, PowerShell verification commands

---

## File Structure

- Modify `layouts/partials/head.html`: retain the existing metadata and stylesheets, then conditionally render the complete Google tag in production.
- Do not edit `public/` directly; Hugo regenerates it during verification.

### Task 1: Add the production-only Google tag

**Files:**
- Modify: `layouts/partials/head.html`

- [ ] **Step 1: Establish the development-build assertion**

Run:

```powershell
hugo --environment development --destination "$env:TEMP\raynorpat-ga-development" --cleanDestinationDir
if (rg -l "G-DD9FSCLZD7" "$env:TEMP\raynorpat-ga-development" -g "*.html") { throw "Analytics tag unexpectedly present in development HTML" }
```

Expected: Hugo exits successfully and the assertion produces no output. This establishes the required development behavior before the implementation.

- [ ] **Step 2: Establish that the production assertion initially fails**

Run:

```powershell
hugo --environment production --destination "$env:TEMP\raynorpat-ga-production" --cleanDestinationDir
if (-not (rg -l "G-DD9FSCLZD7" "$env:TEMP\raynorpat-ga-production" -g "*.html")) { throw "Analytics tag missing from production HTML" }
```

Expected: the command throws `Analytics tag missing from production HTML` before the template is changed.

- [ ] **Step 3: Add the minimal template implementation**

Append this exact block after the stylesheet links in `layouts/partials/head.html`:

```html
{{ if hugo.IsProduction }}
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DD9FSCLZD7"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-DD9FSCLZD7');
</script>
{{ end }}
```

- [ ] **Step 4: Verify both environment assertions pass**

Run:

```powershell
hugo --environment development --destination "$env:TEMP\raynorpat-ga-development" --cleanDestinationDir
if (rg -l "G-DD9FSCLZD7" "$env:TEMP\raynorpat-ga-development" -g "*.html") { throw "Analytics tag unexpectedly present in development HTML" }
hugo --environment production --destination "$env:TEMP\raynorpat-ga-production" --cleanDestinationDir
if (-not (rg -l "G-DD9FSCLZD7" "$env:TEMP\raynorpat-ga-production" -g "*.html")) { throw "Analytics tag missing from production HTML" }
```

Expected: both Hugo builds exit successfully, development HTML contains no measurement ID, and production HTML contains the measurement ID.

- [ ] **Step 5: Confirm every generated production HTML page is covered**

Run:

```powershell
$productionPages = @(Get-ChildItem "$env:TEMP\raynorpat-ga-production" -Recurse -Filter "*.html")
$taggedPages = @(rg -l "googletagmanager\.com/gtag/js\?id=G-DD9FSCLZD7" "$env:TEMP\raynorpat-ga-production" -g "*.html")
if ($productionPages.Count -ne $taggedPages.Count) { throw "Google tag is missing from one or more production HTML pages" }
```

Expected: the assertion exits without an error because the shared head partial supplies the tag to every generated HTML page.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- layouts/partials/head.html
git commit -m "Add production Google Analytics tag"
```

Expected: Git creates one commit containing only the shared head partial change.

