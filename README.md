# Image Manager CLI

- Auto tag generation: timestamp, git commit, git tag, semver, manual
- Optional `latest` tagging
- Docker login support
- DNS check for registry host

## Install (local)

Use pnpm to install and build, then run via npx or link locally.

```bash
pnpm install
pnpm run build
npx container-deploy --help
# or link for local global usage
## Usage
```

## Usage

Initialize config (creates `image-manager.yml`):

```bash
container-deploy init
Build:

Build:

```bash
container-deploy build
```
Deploy:
Deploy:

```bash
container-deploy deploy
```

## Configuration (image-manager.yml)

By default, `container-deploy init` creates `image-manager.yml` in your project. Example:

```yaml
project:
  name: my-app           # Display/name for the image
  dockerfile: ./Dockerfile
registry:
  url: registry.example.com   # e.g., ghcr.io, registry.hub.docker.com (with org/repo below)
  repository: my/app          # repository path in the registry
  username: "${REGISTRY_USERNAME}"
  password: "${REGISTRY_PASSWORD}"
docker:
  localImageName: my-app      # local image name used during build
  buildArgs: {}
  buildContext: .
deployment:
  tagStrategy: git_commit     # timestamp | git_commit | git_tag | manual | semver
  pushLatest: true            # also push :latest alongside the generated tag
  dnsCheck: true              # verify registry DNS before pushing
  autoCleanup: false          # remove local images after deploy
```

Tips:
- Set credentials via env vars if not in config: `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.
- Override the tag strategy at runtime with `--tag` to set a manual tag.
- Use `--no-latest` on deploy to skip pushing the `latest` tag.
## Examples

Build with custom build args and no cache:

```bash
container-deploy build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) --no-cache
```

Deploy skipping build and without pushing latest:

```bash
container-deploy deploy --skip-build --no-latest
```
