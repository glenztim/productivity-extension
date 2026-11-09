# Focused Time

A browser extension (Firefox first) that turns time on productive sites into a pool of time you can spend on distracting ones, with hard blocks and per-site tab limits. Everything stays on your device: nothing is sent anywhere, and the only sites stored are the ones you type into your own lists.

Built with [WXT](https://wxt.dev), React and TypeScript.

## Develop

Requires Node 22 or newer.

```sh
npm ci                 # install exactly what package-lock.json says
npm run dev:firefox    # Firefox with live reload
npm test               # unit tests
npm run compile        # type check
```

To see generated sample data in the dashboard while developing, create a git-ignored `.env.local` containing `WXT_MOCK_DATA=true`. It only has an effect under `npm run dev`; builds never include mock data.

## Build from source

This is also what Mozilla's add-on reviewers follow to reproduce the uploaded build.

```sh
npm ci
npm run zip:firefox
```

The extension is written to `.output/firefox-mv3/`, the upload to `.output/focused-time-<version>-firefox.zip` and the source upload to `.output/focused-time-<version>-sources.zip`. No other tools are needed. Building the sources zip on another machine gives byte-identical files.

## Trying the alpha

See [ALPHA.md](ALPHA.md) for loading it temporarily, signing it on addons.mozilla.org, and what to check afterwards.
