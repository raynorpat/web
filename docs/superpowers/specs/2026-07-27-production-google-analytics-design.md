# Production Google Analytics Integration

## Goal

Add the Google Analytics 4 tag for measurement ID `G-DD9FSCLZD7` to every production HTML page without sending analytics events from local development previews.

## Design

Place the supplied Google tag in `layouts/partials/head.html`, the shared head partial rendered by the site's base template. Wrap both script elements in Hugo's `{{ if hugo.IsProduction }}` conditional.

This keeps the integration centralized and ensures that:

- `hugo --environment production` and the default `hugo build` include the tag.
- `hugo server`, whose default environment is development, excludes the tag.
- Every page using `layouts/_default/baseof.html`, including the home page, content pages, and the 404 page, receives consistent behavior.

No new configuration parameter, partial, dependency, consent interface, or custom JavaScript file is needed.

## Verification

1. Run a development build and confirm `G-DD9FSCLZD7` does not appear in generated HTML.
2. Run a production build and confirm the measurement ID and Google Tag Manager script URL appear in generated HTML.
3. Confirm the production build completes successfully.

