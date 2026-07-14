# Contribution Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a combined GitHub + Gitea contribution heatmap SVG to the homepage, built at deploy time by a Node script.

**Architecture:** A Node.js script fetches the last year of contribution data from GitHub (GraphQL API) and Gitea (REST API), merges by day, and writes `data/contributions.json`. A Hugo partial renders the data as an inline SVG 53×7 cell grid on the homepage. The Azure SWA workflow runs the script before `hugo --minify`.

**Tech Stack:** Node 20+ (built-in `fetch`), Hugo, SVG, GitHub Actions

## Global Constraints

- No JS runtime dependencies — use only Node built-in `fetch`
- Data file goes in `data/contributions.json` so Hugo auto-loads it as `.Site.Data.contributions`
- SVG heatmap uses the site's existing CSS custom properties (`--color-*`) for dark mode support
- Script uses `GH_TOKEN`, `GITEA_TOKEN`, `GITEA_URL` env vars (already in repo secrets or added)

---

### Task 1: Fetch and merge script

**Files:**
- Create: `scripts/fetch-contributions.js`

**Output:**
- `data/contributions.json` with shape:
  ```json
  {
    "months": [{ "name": "August", "week": 2 }],
    "grid": [[0,3,1,5,0,2,0], [2,0,0,1,4,3,1]],
    "max": 15
  }
  ```
  Each entry in `grid` is one ISO week (Mon–Sun as 7 integers). `months` maps month names to their 0-based week index in the grid for labels. `max` is the highest single-day count across both sources.

- [ ] **Step 1: Write the script**

```js
// scripts/fetch-contributions.js
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GH_TOKEN = process.env.GH_TOKEN;
const GITEA_TOKEN = process.env.GITEA_TOKEN;
const GITEA_URL = process.env.GITEA_URL;
const GITEA_USER = process.env.GITEA_USER || 'raynorpat';

if (!GH_TOKEN || !GITEA_TOKEN || !GITEA_URL) {
  console.error('Missing GH_TOKEN, GITEA_TOKEN, or GITEA_URL');
  process.exit(1);
}

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
oneYearAgo.setDate(oneYearAgo.getDate() - 1); // pad a day

const toISO = (d) => d.toISOString().slice(0, 10);

const ghQuery = `{
  "query": "query { viewer { contributionsCollection(from: \\"${toISO(oneYearAgo)}T00:00:00Z\\", to: \\"${toISO(now)}T23:59:59Z\\") { contributionCalendar { months { name firstWeek } weeks { firstDay contributionDays { date contributionCount } } } } } }"
}`;

async function fetchGitHub() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: ghQuery,
  });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  const json = await res.json();
  const cal = json.data.viewer.contributionsCollection.contributionCalendar;
  const byDate = {};
  for (const week of cal.weeks) {
    for (const day of week.contributionDays) {
      byDate[day.date] = (byDate[day.date] || 0) + day.contributionCount;
    }
  }
  const months = cal.months.map((m) => ({ name: m.name, week: m.firstWeek }));
  return { byDate, months };
}

async function fetchGitea() {
  const res = await fetch(`${GITEA_URL}/api/v1/users/${GITEA_USER}/heatmap`, {
    headers: GITEA_TOKEN ? { Authorization: `token ${GITEA_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`Gitea API: ${res.status}`);
  const data = await res.json();
  const byDate = {};
  for (const entry of data) {
    const date = toISO(new Date(entry.timestamp * 1000));
    byDate[date] = (byDate[date] || 0) + entry.contributions;
  }
  return byDate;
}

function buildGrid(merged) {
  const start = new Date(oneYearAgo);
  const end = new Date(now);
  const weeks = [];
  let max = 0;

  // Walk day-by-day from start to end
  const current = new Date(start);
  while (current <= end) {
    const date = toISO(current);
    const count = merged[date] || 0;
    if (count > max) max = count;
    weeks.push(count);
    current.setDate(current.getDate() + 1);
  }

  // Pad front to start on Monday
  const firstDay = new Date(start);
  const padFront = (firstDay.getDay() + 6) % 7; // days to Monday
  for (let i = 0; i < padFront; i++) weeks.unshift(0);

  // Pad end to finish on Sunday
  const lastDay = new Date(end);
  const padEnd = 6 - ((lastDay.getDay() + 6) % 7); // days to Sunday
  for (let i = 0; i < padEnd; i++) weeks.push(0);

  // Slice into weekly rows of 7
  const grid = [];
  for (let i = 0; i < weeks.length; i += 7) {
    grid.push(weeks.slice(i, i + 7));
  }

  return { grid, max };
}

async function main() {
  const [gh, gitea] = await Promise.all([fetchGitHub(), fetchGitea()]);

  const merged = { ...gh.byDate };
  for (const [date, count] of Object.entries(gitea)) {
    merged[date] = (merged[date] || 0) + count;
  }

  const { grid, max } = buildGrid(merged);

  const out = JSON.stringify({ months: gh.months, grid, max });
  writeFileSync(join(__dirname, '..', 'data', 'contributions.json'), out);
  console.log('Wrote data/contributions.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script locally to verify it works**

```bash
cd /Users/raynorpat/Projects/web
node scripts/fetch-contributions.js
```

Expected: `Wrote data/contributions.json` file appears at `data/contributions.json` with the grid shape.

- [ ] **Step 3: Add `data/contributions.json` to `.gitignore`** (derived artifact)

```bash
echo "data/contributions.json" >> .gitignore
git add .gitignore data/contributions.json scripts/fetch-contributions.js
git commit -m "heatmap: add fetch-contributions script"
```

---

### Task 2: SVG heatmap partial

**Files:**
- Create: `layouts/partials/contribution-heatmap.html`

**Interfaces:**
- Consumes: `.Site.Data.contributions` (the JSON from Task 1 — `months`, `grid`, `max`)
- Produces: inline SVG rendered into the homepage

- [ ] **Step 1: Write the partial**

```html
{{ with .Site.Data.contributions }}
{{ if .grid }}
<section class="contribution-heatmap">
  <h2 class="contribution-heatmap__title">Coding activity</h2>
  <svg class="contribution-heatmap__svg" viewBox="0 0 760 128" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contribution graph for the last year">
    {{ $cellSize := 12 }}{{ $gap := 2 }}{{ $colW := 14 }}{{ $rowH := 14 }}{{ $labelH := 16 }}
    {{ range $wi, $week := .grid }}
    {{ $x := mul $wi $colW }}
    {{ range $di, $count := $week }}
    {{ $y := add $labelH (mul $di $rowH) }}
    {{ $level := 0 }}
    {{ if gt $.max 0 }}{{ $level = div (mul $count 5) (add $.max 1) }}{{ end }}
    <rect x="{{ $x }}" y="{{ $y }}" width="{{ $cellSize }}" height="{{ $cellSize }}" rx="2" class="heatmap-cell heatmap-cell--l{{ $level }}" />
    {{ end }}{{ end }}
    {{ range .months }}
    <text x="{{ mul .week $colW }}" y="11" class="heatmap-label">{{ .name }}</text>
    {{ end }}
    <text x="-2" y="{{ add $labelH 10 }}" class="heatmap-label heatmap-label--day">Mon</text>
    <text x="-2" y="{{ add $labelH (mul 3 $rowH) 2 }}" class="heatmap-label heatmap-label--day">Wed</text>
    <text x="-2" y="{{ add $labelH (mul 5 $rowH) 4 }}" class="heatmap-label heatmap-label--day">Fri</text>
  </svg>
</section>
{{ end }}{{ end }}
```

- [ ] **Step 2: Commit**

```bash
git add layouts/partials/contribution-heatmap.html
git commit -m "heatmap: add SVG heatmap partial"
```

---

### Task 3: Add heatmap to homepage

**Files:**
- Modify: `layouts/index.html` (insert partial call before the buttons)

- [ ] **Step 1: Insert the partial call**

```html
{{ partial "contribution-heatmap.html" . }}
```

in `layouts/index.html` between the email paragraph and the actions div:

```
     <p class="hero__email">Shoot an email to raynorpat@#{thisdomain} and say hello.</p>
+    {{ partial "contribution-heatmap.html" . }}
     <div class="hero__actions">
```

- [ ] **Step 2: Commit**

```bash
git add layouts/index.html
git commit -m "heatmap: embed contribution heatmap on homepage"
```

---

### Task 4: Heatmap cell colors CSS

**Files:**
- Modify: `static/css/main.css` (add cell fill and label styles)

- [ ] **Step 1: Add CSS after the `.post` rules**

```css
.contribution-heatmap {
  margin: var(--space-6) 0;
}

.contribution-heatmap__title {
  font-size: var(--font-size-subheading);
  font-weight: var(--font-weight-subheading);
  margin: 0 0 var(--space-3);
}

.contribution-heatmap__svg {
  display: block;
  width: 100%;
  max-width: 720px;
  height: auto;
}

.heatmap-cell {
  fill: var(--color-border);
}

.heatmap-cell--l1 { fill: #9be9a8; }
.heatmap-cell--l2 { fill: #40c463; }
.heatmap-cell--l3 { fill: #30a14e; }
.heatmap-cell--l4 { fill: #216e39; }

.heatmap-label {
  fill: var(--color-text-2);
  font-size: 10px;
  font-family: var(--font-family);
}

.heatmap-label--day {
  text-anchor: end;
  font-size: 9px;
}

@media (prefers-color-scheme: dark) {
  .heatmap-cell { fill: #2d2d33; }
  .heatmap-cell--l1 { fill: #0e4429; }
  .heatmap-cell--l2 { fill: #006d32; }
  .heatmap-cell--l3 { fill: #26a641; }
  .heatmap-cell--l4 { fill: #39d353; }
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/main.css
git commit -m "heatmap: add cell and label CSS"
```

---

### Task 5: Update CI workflow

**Files:**
- Modify: `.github/workflows/azure-static-web-app.yml`

- [ ] **Step 1: Add script step before Build with Hugo**

Insert between the Hugo setup step and the Build step:

```yaml
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Fetch contributions
        run: node scripts/fetch-contributions.js
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}
          GITEA_URL: ${{ secrets.GITEA_URL }}
```

The full build section becomes:

```yaml
      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: '0.164.0'
          extended: false
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Fetch contributions
        run: node scripts/fetch-contributions.js
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}
          GITEA_URL: ${{ secrets.GITEA_URL }}
      - name: Build with Hugo
        run: hugo --minify
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/azure-static-web-app.yml
git commit -m "heatmap: add fetch step to CI workflow"
```

---

### Task 6: Final build verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/raynorpat/Projects/web
hugo --minify
```

Expected: build succeeds, no errors. Check that `public/index.html` contains the SVG heatmap markup.

- [ ] **Step 2: Commit any fixups**

```bash
git commit -am "heatmap: fixups after build verification"
```
