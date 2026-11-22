# Kitphonic

Kitphonic is a static phonics reading app. `npm start` serves it locally. There is no web build step.

## How a merge reaches the site

A merge to `develop` or `main` starts a GitHub Actions run. The test gate is the same pair the pull-request workflow already runs: `npm test`, then `npm run test:e2e` (Playwright on Chromium and WebKit). Pull requests also run the touch-target size check before merge. The deploy job runs only after both gate jobs succeed. A failing gate fails the Actions run and leaves the deploy job skipped, so that commit is not published by the workflow.

| Merge into | Site | Workflow |
| --- | --- | --- |
| `develop` | [Dev](https://digitalfarmer420.github.io/kitphonic-dev/) | [`.github/workflows/deploy-dev.yml`](.github/workflows/deploy-dev.yml) copies that commit into the `kitphonic-dev` repository. GitHub Pages serves that repository from its `main` branch. The page carries a DEV badge. |
| `main` | [Production](https://digitalfarmer420.github.io/kitphonic/) | [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml) uploads that commit with the GitHub Pages Actions deploy. |

Dev publishing uses the existing `DEV_DEPLOY_KEY` secret, an SSH key that can write to `kitphonic-dev` only. These workflows publish the web app. They do not sign or upload an Android package.

### Production Pages source

For the production workflow to be the publisher, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** after `.github/workflows/deploy-prod.yml` is on `main`.

Until that source is GitHub Actions, Pages remains a branch publisher and uploads `main` (`/`) on every push to `main`, whether or not the test gate passed. Set the source to GitHub Actions only once `deploy-prod.yml` is already on `main`; before that file is on `main`, GitHub Actions has nothing to publish. The `github-pages` environment already allows deployments from `main`.

## Version numbers

The visible app version (`VERSION` and `js/version.js`, shown in the Grown-ups footer) is the
deploy date in America/Los_Angeles: `YYYY.MM.DD.N`. `N` starts at 1 and goes up for each later
deploy of that environment on the same day. Dev and production each have their own counter.
Dev also keeps its existing DEV badge.

The number is stamped at deploy time by [`.github/workflows/deploy-dev.yml`](.github/workflows/deploy-dev.yml) and
[`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml), using [`tools/stamp-version.mjs`](tools/stamp-version.mjs).
It is written only into the published copy (along with the service-worker cache name, because `js/version.js` is precached).
The committed files stay at the last release or a placeholder and are not pushed back to the branch.

The next `N` comes from git tags the workflow creates on this repository: `dev-YYYY.MM.DD.N` on a develop deploy, and `vYYYY.MM.DD.N` on a production deploy. Legacy tags such as `v1.0.0-rc10` are ignored. If that commit already has a tag for that environment, the deploy reuses it, so a re-run does not skip a number. A new commit gets the next `N`. An emergency production deploy (`workflow_dispatch` with `emergency_override`) uses the same stamping. The committed `VERSION` is also a floor when it falls on the same date, so a number already shown as the last release is not reused.

You do not need to run `node tools/bump-version.mjs` before a release. It remains available for a local stamp. Android `versionName` / `versionCode` stay with the packager.

