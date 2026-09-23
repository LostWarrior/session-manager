# Session Manager

A desktop browser extension for saving sessions and managing existing browser bookmarks in Firefox, Chrome, and Brave.

## Develop

Use Node.js 24 or newer and npm.

```sh
npm ci
npm run check
npm run build
npm run test:browser
```

`npm run lint:fix` applies available lint fixes. Build output is regenerated in `dist/chromium` and `dist/firefox`. Browser tests use temporary profiles; `SM_BROWSER` can select a Chromium browser executable. The default test executable is Chrome's standard macOS installation path; other platforms must set `SM_BROWSER` explicitly.

For Brave on macOS:

```sh
SM_BROWSER='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' \
  SM_EXTENSION_LOAD=flags npm run test:browser
```

The alternate loader is needed by Brave versions without Chrome's `Extensions.loadUnpacked` debugging API.

## Load the extension

- Chrome: open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.
- Brave: open `brave://extensions` and load `dist/chromium` in Developer mode.
- Firefox: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Temporary installation is for development and must be reloaded after Firefox exits.

The manifests require Chrome 121+ and Firefox 142+. These are declared API floors, not a claim that every intervening browser release has been tested. Store signing, icons, and distribution metadata still need release preparation.

## Available now

- Save the current window from the popup or all normal windows from the library.
- Search, preview, rename, favorite, restore, and move sessions to/recover from Trash.
- Permanently delete individual trashed sessions or empty all Trash, with confirmation.
- Preserve HTTP/HTTPS URLs, window membership, tab order, and pinning; exclude private browsing.
- Export/import session JSON backups, and import Tab Session Manager exports. Imports create copies and never open URLs automatically.
- Optionally enable native bookmarks, search by folder/title/URL, and add, edit, or delete individual bookmarks.

Session saves commit to IndexedDB before reporting success. Restore keeps existing tabs and reports partial failures. Interrupted restores are never automatically replayed; inspect existing tabs before retrying. Local data is not an external backup: export before removing the extension or browser profile.

Library reads have no session-count limit, and the library shows results 50 at a time. Unreadable stored records are hidden with a notice and kept until you empty Trash, which removes them along with trashed sessions. Imports accept files up to 50 MB, reject invalid records, and are sent in batches; large exports are split into files that each import on their own. Restore history retains up to 100 operation summaries, pruning older entries on the next restore update.

Not yet implemented: selected-tab capture/restore, tags, automatic snapshots, tab groups/containers, bookmark folder creation/moving, automatic multi-view refresh, sync, or resumable restores. Browser dialogs currently provide rename and restore/import/permanent-deletion confirmation.
