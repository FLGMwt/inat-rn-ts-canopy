# Type Canopy

A treemap and file tree showing how much of [iNaturalistReactNative](https://github.com/inaturalist/iNaturalistReactNative)'s `src/` is still plain JavaScript vs. TypeScript.

It's a static site with no build step — `index.html` fetches its data directly from the GitHub API in the browser.

- **Default view** loads `data/cache.json`, a snapshot of `main` refreshed daily by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) via [`scripts/generate-cache.mjs`](scripts/generate-cache.mjs).
- **Paste a branch, tag, or commit SHA** into the "Evaluate a ref" box to fetch that ref live from GitHub instead, or link directly with `?branch=<ref>` / `?sha=<full-sha>` (subject to the API's public rate limit of 60 requests/hour without auth).
- Live ref lookups are cached in the browser: full SHAs are reused longer, while moving symbolic refs are refreshed more often.

## Local dev

```
node scripts/generate-cache.mjs   # writes data/cache.json
python3 -m http.server            # serve the repo root and open index.html
```
