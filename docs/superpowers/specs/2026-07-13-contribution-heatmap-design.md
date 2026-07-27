# Contribution Heatmap

Show a combined GitHub + Gitea contribution heatmap on the homepage of raynorpat.com.

## Data Pipeline

A Node.js script (`scripts/fetch-contributions.js`) runs at build time:

1. Reads env vars `GH_TOKEN`, `GITEA_TOKEN`, `GITEA_URL`
2. Calls GitHub GraphQL API (`viewer.contributionsCollection.contributionCalendar`) for last year of contributions
3. Calls Gitea API (`GET /api/v1/users/{username}/heatmap`) for last year of contributions
4. Merges both by date (sums counts per day)
5. Writes `data/contributions.json` as a week-grid array

Data shape in `data/contributions.json`:

```json
{
  "weeks": [
    { "date": "2025-07-14", "days": [0, 3, 1, 5, 0, 2, 0] }
  ]
}
```

Each entry: `date` is the Monday of that ISO week (string), `days` is a 7-element array Sun–Sat of integer counts.

## Hugo Template

A partial renders an inline SVG heatmap grid on the homepage. The SVG:
- 53 columns (weeks) × 7 rows (days)
- Month labels across the top
- Day-of-week labels on the left (optional, or just M/W/F)
- Cell color uses 5-shade scale based on contribution count, mapped to CSS custom properties for dark mode

Placed on the homepage between the tagline and the buttons, with a heading like "Coding activity" or similar.

## CI Integration

The GitHub Actions workflow (`.github/workflows/azure-static-web-app.yml`) runs `node scripts/fetch-contributions.js` before `hugo --minify`. Required secrets: `GITHUB_TOKEN` (already available), `GITEA_TOKEN` and `GITEA_URL` (add to repo secrets).

## CSS

Add 5 fill-color utility classes mapping to the site's color palette, plus dark-mode variants via `prefers-color-scheme`.

## Files Changed

- `scripts/fetch-contributions.js` (new)
- `layouts/partials/contribution-heatmap.html` (new)
- `layouts/index.html` (insert partial call)
- `static/css/main.css` (heatmap cell colors)
- `.github/workflows/azure-static-web-app.yml` (add script step)
