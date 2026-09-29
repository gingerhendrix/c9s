# Releasing c9s

c9s is published to npm as [`@tooee/c9s`](https://www.npmjs.com/package/@tooee/c9s). Users run it with `bunx @tooee/c9s`.

## The package

- npm ships `bin/c9s`, `src/`, `README.md`, `LICENSE` and `package.json`. There is no build step. `bin/c9s` starts `src/cli.tsx` with Bun, so the package needs Bun 1.3 or later.
- Each `.tsx` file declares `@jsxImportSource @opentui/react`, so the JSX works without the repository's `tsconfig.json`.
- `prepublishOnly` runs the type check, lint and tests before any publish.

Check the contents before a release:

```bash
npm pack --dry-run
```

## Every release

1. Bump `version` in `package.json`.
2. Add a section for the version to `CHANGELOG.md`.
3. Commit both files on `main` as `chore(release): vX.Y.Z` and push.
4. Tag the commit and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The tag starts `.github/workflows/release.yml`. The workflow checks that the tag matches `package.json`, runs the checks, publishes to npm with provenance, and creates a GitHub release.

## First release only

npm trusted publishing can only be set up for a package that already exists. So publish 0.1.0 by hand:

```bash
npm login                        # the account that owns the @tooee scope
git switch main && git pull
bun install --frozen-lockfile
npm publish --access public
```

Then set up trusted publishing on npmjs.com, under the package settings for `@tooee/c9s`:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `gingerhendrix` |
| Repository | `c9s` |
| Workflow filename | `release.yml` |

After that, push the `v0.1.0` tag. The workflow sees that 0.1.0 is already on npm, skips the publish and creates the GitHub release. Later versions publish through the workflow with no npm token.
