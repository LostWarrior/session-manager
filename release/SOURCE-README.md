# Building the Firefox package from source

Requires Node.js 24+ and npm on macOS, Linux, or Windows.

```sh
npm ci
npm run build
```

The Firefox package is `dist/firefox`. TypeScript is compiled with `tsc` and is neither bundled nor minified. `npm run check` runs lint, tests, and Mozilla validation.
