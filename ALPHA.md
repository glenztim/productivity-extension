# Focused Time: Firefox alpha

Needs Firefox 140 or newer (`strict_min_version` in the manifest). Version, ID and name come from `package.json` and `wxt.config.ts`.

> **The add-on ID is `focus-pool@timglenz` (`wxt.config.ts`, `browser_specific_settings.gecko.id`).**
> Change it *before* the first signing if you want a different one. Firefox keys an add-on's stored data and its updates on the ID, so after you have a signed, installed alpha with real data, a new ID is a different add-on and starts with empty data.

## Build

```sh
npm ci
npm run build:firefox      # unpacked extension in .output/firefox-mv3/
npm run zip:firefox        # .output/focused-time-<version>-firefox.zip and ...-sources.zip
npm run compile && npm test
npx web-ext lint -s .output/firefox-mv3    # optional: Mozilla's own checks, offline
```

`web-ext lint` reports two `UNSAFE_VAR_ASSIGNMENT` warnings in `chunks/theme-*.js`. They come from the React library bundled into every page, not from this project's code.

## (a) Load it temporarily (about:debugging)

Good for trying changes quickly. It disappears when Firefox closes.

1. `npm run build:firefox`.
2. In Firefox open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on…** and pick `.output/firefox-mv3/manifest.json`.
4. **Inspect** next to the add-on opens its console and a storage viewer.

`npm run dev:firefox` does the same with live reload in a separate Firefox profile.

## (b) Sign it as an unlisted add-on (survives restarts)

Release Firefox only installs signed add-ons permanently. "Unlisted" means Mozilla signs the file and gives it back to you; nothing is published on the public add-on site. This route is done in the browser, so no API keys are involved.

1. Sign in at <https://addons.mozilla.org/developers/> with a Firefox account (create the developer profile when asked).
2. **Submit a New Add-on**, then choose **On your own** (unlisted) as the distribution.
3. Upload `.output/focused-time-<version>-firefox.zip`. Wait for the automated validation. Errors must be fixed; the two innerHTML warnings above are expected.
4. The bundle is minified, so AMO asks whether you need to submit source code. Answer **yes** and upload `.output/focused-time-<version>-sources.zip`. In the notes for reviewers write:

   > Build with Node 22 or newer: `npm ci` then `npm run zip:firefox`. The extension is written to `.output/firefox-mv3/`. No other tools or environment variables are needed.

5. Unlisted versions are signed automatically after the automated checks, usually within minutes (manual review can follow later). Download the signed `.xpi` from the version's page.
6. Install it: drag the `.xpi` into a Firefox window, or Add-ons Manager, gear menu, **Install Add-on From File…**.

Every upload needs a higher version than the previous one: `npm version 0.1.1 --no-git-tag-version`, then build, zip and submit again. Installing the new `.xpi` over the old one keeps your data (same ID). Automatic updates would need an `update_url` that is not set up, so updates are manual for now.

## (c) What to check after installing

Open `about:debugging` and click **Inspect** on the add-on for the console and the Storage tab.

**Install and permissions**
- [ ] `about:addons` lists "Focused Time" at the expected version, and its Permissions tab shows no "access your data for all websites" (the `<all_urls>` host permission was removed).
- [ ] The popup opens, shows the pool and today's progress, and no sample data appears anywhere.

**Messages from the pages to the background**
- [ ] Start and end a short session from the popup. Start and end a long session with a custom length.
- [ ] Zero, empty or negative minutes in the popup leave the start buttons disabled.
- [ ] Nothing like "untrusted-sender" or "invalid-message" shows in the add-on console during normal use. (If the popup does nothing, that is the first place to look.)

**Blocking** (works without host permission only if `webNavigation` still gets URLs; unverified)
- [ ] Add a site to the blocklist, start a hard block, open that site: you land on the blocked page. If the site loads, restore `host_permissions: ['<all_urls>']` in `wxt.config.ts` (commit "Drop the <all_urls> host permission").
- [ ] Cancelling the hard block from the blocked page (type CANCEL) works.

**Tab limits**
- [ ] Limit a site to 2 tabs, open a third: it closes and a "Tab limit reached" notification appears; the dashboard's auto-closed count goes up.
- [ ] Open a new window whose only tab is on the limited site: it is not closed. It shows "Tab limit reached for <site>" and the window stays.
- [ ] Quit Firefox with 3+ tabs of a limited site, start it again with session restore: none are closed in the first ~5 seconds.
- [ ] Leave Firefox idle for a minute (the background is suspended), then browse within a limited site in a tab that was already open: it is not closed. For a faster test set `extensions.background.idle.timeout` to a small value in `about:config`.

**Surviving restarts**
- [ ] Start a long session of 1 minute, quit Firefox, start it again after more than a minute: the mode is back to free.
- [ ] Stats, lists and settings are still there after a restart. In the Inspect storage view, `schemaVersion` is 1 and `checkpoint` has no hostname.

**Behaviour to know about**
- Private windows: Firefox does not run extensions there unless you allow it for this add-on in `about:addons`. Tabs in private windows are neither tracked nor limited.
- `storage.session` (used for the tab bookkeeping and the start-up marker) is cleared when the add-on is reloaded, updated or Firefox restarts. After one of those, tab limits pause for about five seconds.
