# Contribution Heatmap Level Mapping Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix heatmap cell coloring so every non-zero contribution day is visible (at least level 1), while peak days still reach level 4.

**Architecture:** Hugo integer division currently maps low counts to level 0 (same gray as empty). Replace the level formula in the heatmap partial with a ceiling-based `count * 4 / max` scale clamped to `[1, 4]` for `count > 0`. Optionally add a one-line fetch summary log so sparse API results are obvious. Verify with a fixture JSON (no secrets required) plus a real fetch when tokens are available.

**Tech Stack:** Hugo 0.164 templates, existing CSS `.heatmap-cell--l1`…`--l4`, Node 20 fetch script

**Spec:** `docs/superpowers/specs/2026-07-14-contribution-heatmap-levels-design.md`

## File map

| File | Role |
|------|------|
| `layouts/partials/contribution-heatmap.html` | Level math for each SVG cell (required change) |
| `scripts/fetch-contributions.js` | Optional summary log after merge |
| `data/contributions.json` | Derived artifact (gitignored); use fixture for local verify |

This site has no automated test runner — verification is node one-liners, Hugo build, and grepping rendered HTML.

---

### Task 1: Fix Hugo level mapping

**Files:**
- Modify: `layouts/partials/contribution-heatmap.html`

- [ ] **Step 1: Prove current formula hides low counts**

Run:

```bash
node -e '
function bad(count, max) {
  if (!(max > 0)) return 0;
  return Math.floor((count * 5) / (max + 1));
}
console.log("count=1 max=40 →", bad(1, 40), "(expect 0 = BUG)");
console.log("count=40 max=40 →", bad(40, 40), "(expect >0)");
'
```

Expected:

```
count=1 max=40 → 0 (expect 0 = BUG)
count=40 max=40 → 4 (expect >0)
```

- [ ] **Step 2: Prove fixed formula keeps low counts visible**

Run:

```bash
node -e '
function good(count, max) {
  if (count === 0) return 0;
  let level = Math.floor((count * 4 + max - 1) / max);
  if (level < 1) level = 1;
  if (level > 4) level = 4;
  return level;
}
console.log("count=0 max=40 →", good(0, 40), "(expect 0)");
console.log("count=1 max=40 →", good(1, 40), "(expect 1)");
console.log("count=10 max=40 →", good(10, 40), "(expect 1)");
console.log("count=20 max=40 →", good(20, 40), "(expect 2)");
console.log("count=40 max=40 →", good(40, 40), "(expect 4)");
console.log("count=1 max=1 →", good(1, 1), "(expect 4)");
'
```

Expected:

```
count=0 max=40 → 0 (expect 0)
count=1 max=40 → 1 (expect 1)
count=10 max=40 → 1 (expect 1)
count=20 max=40 → 2 (expect 2)
count=40 max=40 → 4 (expect 4)
count=1 max=1 → 4 (expect 4)
```

- [ ] **Step 3: Replace level assignment in the partial**

In `layouts/partials/contribution-heatmap.html`, replace the level block (currently around lines 12–13):

```
{{ $level := 0 }}
{{ if gt $data.max 0 }}{{ $level = div (mul $count 5) (add $data.max 1) }}{{ end }}
```

with:

```
{{ $level := 0 }}
{{ if gt $count 0 }}
{{ $level = div (add (mul $count 4) (sub $data.max 1)) $data.max }}
{{ if lt $level 1 }}{{ $level = 1 }}{{ end }}
{{ if gt $level 4 }}{{ $level = 4 }}{{ end }}
{{ end }}
```

Full relevant loop for context (keep surrounding SVG markup unchanged):

```html
{{ range $di, $count := $week }}
{{ $y := add $labelH (mul $di $rowH) }}
{{ $level := 0 }}
{{ if gt $count 0 }}
{{ $level = div (add (mul $count 4) (sub $data.max 1)) $data.max }}
{{ if lt $level 1 }}{{ $level = 1 }}{{ end }}
{{ if gt $level 4 }}{{ $level = 4 }}{{ end }}
{{ end }}
<rect x="{{ $x }}" y="{{ $y }}" width="{{ $cellSize }}" height="{{ $cellSize }}" rx="2" class="heatmap-cell heatmap-cell--l{{ $level }}" />
{{ end }}
```

Note: `count > 0` implies `$data.max >= $count > 0`, so dividing by `$data.max` is safe.

- [ ] **Step 4: Verify with a fixture JSON (no API tokens needed)**

Write a temporary fixture (overwrites local gitignored file):

```bash
cat > data/contributions.json <<'EOF'
{"months":[{"name":"Jul","week":0}],"grid":[[0,1,10,20,40,0,0]],"max":40}
EOF
```

Build:

```bash
hugo --minify
```

Expected: `hugo` exits 0.

Check rendered levels:

```bash
rg -o 'heatmap-cell--l[0-4]' public/index.html | sort | uniq -c
```

Expected (at least):

- `heatmap-cell--l0` present (the zeros)
- `heatmap-cell--l1` present (counts 1 and 10)
- `heatmap-cell--l2` present (count 20)
- `heatmap-cell--l4` present (count 40)
- no reliance on only two green cells for a dense fixture

Sanity check the five count cells specifically appear:

```bash
rg 'heatmap-cell heatmap-cell--l[0-4]' public/index.html | head -20
```

Expected: among the first week’s rects, classes include `--l0`, `--l1`, `--l1`, `--l2`, `--l4`, `--l0`, `--l0` in that order for counts `[0,1,10,20,40,0,0]`.

- [ ] **Step 5: Commit**

```bash
git add layouts/partials/contribution-heatmap.html
git commit -m "$(cat <<'EOF'
heatmap: map non-zero days to at least level 1

EOF
)"
```

---

### Task 2: Optional fetch summary log + real-data check

**Files:**
- Modify: `scripts/fetch-contributions.js`

- [ ] **Step 1: Add summary counts after merge**

In `scripts/fetch-contributions.js`, inside `main()` after building `merged` / `grid`, replace the single success log so the script reports how dense the year is.

After:

```js
const { grid, max, months } = buildGrid(merged);
```

add:

```js
const sumByDate = (byDate) => Object.values(byDate).reduce((a, b) => a + b, 0);
const nonZeroDays = Object.values(merged).filter((c) => c > 0).length;
```

Then after `writeFileSync(...)`, replace:

```js
console.log('Wrote data/contributions.json');
```

with:

```js
console.log(
  `Wrote data/contributions.json (nonZeroDays=${nonZeroDays}, gh=${sumByDate(gh)}, gitea=${sumByDate(gitea)}, max=${max}, weeks=${grid.length})`
);
```

- [ ] **Step 2: Run fetch when tokens are available**

```bash
# Requires GH_TOKEN, GITEA_TOKEN, GITEA_URL in the environment
node scripts/fetch-contributions.js
```

Expected example shape (numbers vary):

```
Wrote data/contributions.json (nonZeroDays=120, gh=641, gitea=787, max=42, weeks=53)
```

Hard fail conditions (stop and investigate fetch — do not ship color-only):

- `nonZeroDays` is ~0–5 while GitHub/Gitea profiles show hundreds
- `weeks` is not roughly 52–54
- `max` is `0` or `1` with empty-looking activity

If tokens are unavailable in this environment, skip the live fetch and note that CI will populate data on deploy; fixture verify from Task 1 still passes.

- [ ] **Step 3: Rebuild with real JSON (if fetch ran)**

```bash
hugo --minify
rg -o 'heatmap-cell--l[1-4]' public/index.html | sort | uniq -c
```

Expected: many `--l1` (and likely `--l2`+) cells — clearly more than two lit cells.

Visually spot-check the homepage (local `hugo server` or open `public/index.html`): dense Mar–Jul / May–Jul stretches should be visible, not only peak days.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-contributions.js
git commit -m "$(cat <<'EOF'
heatmap: log contribution fetch density summary

EOF
)"
```

If Step 2 was skipped (no tokens) but Step 1 still changed the script, commit the log change alone.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Ceiling `count * 4 / max`, clamp `[1,4]` for `count > 0` | Task 1 |
| Zero stays empty gray | Task 1 |
| CSS classes unchanged | Task 1 (no CSS edits) |
| Verify JSON density / optional fetch log | Task 2 |
| Out of scope: palette, APIs, quartile matching | Not planned |

## Self-review notes

- No placeholders; Hugo has no unit-test harness so node formula proofs + Hugo HTML class inspection replace TDD test files.
- Level formula in Task 1 matches the approved spec exactly.
- Do not re-add `data/contributions.json` to git; it remains gitignored.
