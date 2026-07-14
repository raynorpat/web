# Contribution Heatmap Level Mapping Fix

Fix the homepage contribution heatmap so low-activity days are visible, matching how GitHub and Gitea render non-zero days.

## Problem

The site heatmap showed only ~2 lit cells across the year, while GitHub (~641 contributions) and Gitea (~787 contributions) show dense activity for the same period (especially Mar–Jul / May–Jul).

Root cause: Hugo level math uses integer division and maps low counts to level `0`:

```
level = (count * 5) / (max + 1)
```

Level `0` uses the same fill as empty days (`.heatmap-cell`). Peak days alone reach `--l1`+; everything else looks empty.

## Approach

Fix level mapping in the Hugo partial. Keep the existing fetch/merge pipeline. Verify `contributions.json` still contains many non-zero days so a fetch bug is not mistaken for a color bug.

## Level Mapping

In `layouts/partials/contribution-heatmap.html`:

| Count | Level | CSS |
|-------|-------|-----|
| `0` | `0` | `.heatmap-cell` (empty) |
| `> 0` | `1`–`4` | `.heatmap-cell--l1` … `--l4` |

Hugo-safe formula (ceiling of `count * 4 / max`, clamped):

```
if count == 0 → 0
else → min(4, max(1, div (add (mul count 4) (sub max 1)) max))
```

Any activity is at least `--l1`. The busiest day reaches `--l4`. Existing color tokens / dark-mode rules stay unchanged.

## Verification

1. Run `node scripts/fetch-contributions.js` with `GH_TOKEN`, `GITEA_TOKEN`, `GITEA_URL`.
2. Confirm `data/contributions.json` has ~52–54 weeks, many non-zero cells, and `max > 1`.
3. Optionally add a one-line script log: non-zero day count, GitHub sum, Gitea sum, merged `max`.
4. Rebuild Hugo and confirm dense stretches are visible (not only peak days).

If JSON is sparse after a successful fetch, treat that as a separate fetch bug — do not consider the color fix sufficient alone.

## Out of Scope

- Redesigning the green palette or dark-mode colors
- Changing GitHub GraphQL or Gitea heatmap API usage
- Perfectly matching GitHub’s private quartile algorithm
- Commit-email / contribution eligibility semantics on either platform

## Files

- `layouts/partials/contribution-heatmap.html` — level math (required)
- `scripts/fetch-contributions.js` — optional summary log

## Success Criteria

- Every day with `count > 0` uses at least `--l1`, not empty gray
- Highest days still use `--l4`
- Side-by-side with GitHub/Gitea, dense activity stretches are visible on the site
