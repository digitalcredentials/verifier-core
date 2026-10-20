# Releasing

Publishing to npm is done by the
[Publish workflow](.github/workflows/publish.yml), which runs when a GitHub
release is published.

## One-time setup

The workflow uses npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token
or GitHub secret is needed. An npm admin of `@digitalcredentials/verifier-core`
registers the workflow once, on npmjs.com: package **Settings** → **Trusted
Publisher** → **GitHub Actions**:

- Organization: `digitalcredentials`
- Repository: `verifier-core`
- Workflow filename: `publish.yml`
- Environment: leave blank
- Allowed actions: tick **Allow npm publish**; leave **Allow npm dist-tag**
  unticked

Renaming `publish.yml` breaks this registration.

## Cut a release

The npm version comes from `package.json`, not from the tag. First set `version`
in `package.json` in a pull request, and merge it to `main`.

Then, on GitHub, go to **Releases** → **Draft a new release**:

| Field                     | Prerelease                          | Release                      |
| ------------------------- | ----------------------------------- | ---------------------------- |
| `package.json` version    | `2.0.0-beta.1`                      | `2.0.0`                      |
| Tag                       | `v2.0.0-beta.1` (create on publish) | `v2.0.0` (create on publish) |
| Target                    | `main`                              | `main`                       |
| Title                     | `v2.0.0-beta.1`                     | `v2.0.0`                     |
| Set as a pre-release      | ticked                              | unticked                     |
| Set as the latest release | unticked                            | ticked                       |
| npm dist-tag              | `beta`                              | `latest`                     |

Click **Publish release**. Saving a draft does not publish.

A prerelease installs with `npm install @digitalcredentials/verifier-core@beta`;
a release is what a plain `npm install` gets.

## When the workflow fails

The workflow stops before publishing if:

- the tag, without its leading `v`, differs from the `package.json` version;
- a version with a prerelease suffix (`-beta.1`) is not marked as a pre-release,
  or a version without one is;
- lint, the build, or the Node or browser tests fail.

To retry, fix the problem on `main`, delete the GitHub release and its tag, and
publish the release again. npm never accepts the same version twice, so if a
version did reach npm, bump the version instead.
