# Image Manager CLI (prim)

A user-friendly CLI to build and push Docker images to private registries with automatic tag generation and optional `latest` tagging.

## Features

- Auto tag generation: timestamp, git commit, git tag, semver, manual
  - Generated tags are normalized to include a leading `v` (e.g., `v20250809-123456`, `v1.2.3`, `vabc123`); manual tags are used as-is.
- Optional `latest` tagging
- Docker login support
- DNS pre-check for registry host
- **Image tracking**: Built images are tracked in system storage (`/var/tmp/prim-images`) to allow reuse
- **Interactive image selection**: When testing or deploying, you can choose from previously built images

## Installation

```bash
pnpm install -g private-registry-image-manager
```

## Usage

Help

```bash
prim
```

Initialize config (creates `.registry-deploy.yaml`):

```bash
prim init
```

Build image:

```bash
prim build
```

Deploy image:

```bash
prim deploy
```

## Configuration (.registry-deploy.yaml)

By default, `prim init` creates `.registry-deploy.yaml` in your project. Example:

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
  dnsCheck: true              # verify registry hostname resolves before pushing (safety check)
  autoCleanup: false          # remove local images after deploy
```

Tips:
- Set credentials via env vars if not in config: `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.
- Override the tag strategy at runtime with `--tag` to set a manual tag.
- Use `--no-latest` on deploy to skip pushing the `latest` tag.
- **Security**: If your `.registry-deploy.yaml` contains credentials, ensure it's in `.gitignore` to prevent committing secrets.
- Built images are automatically tracked and can be reused without rebuilding (stored in `/var/tmp/prim-images`).

## Commands

- init: create a new config file interactively or with defaults.
- build: build the Docker image using your config and generated tag.
- deploy: tag and push to the configured registry, optionally pushing `latest`.
- status: show config and Docker environment info, optional registry DNS check.
- test: run the built image locally with ports/env settings before deploying. Shows previously built images to choose from.
- clean: remove local containers and images for this project, optionally for a specific tag. Features interactive multi-select with persistent preferences to exclude specific images from cleanup.

### Examples

Build with custom build args and no cache:

```bash
prim build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) --no-cache
```

Deploy skipping build and without pushing latest:

```bash
prim deploy --skip-build --no-latest
```

Run locally with ports and env vars:

```bash
prim test -p 8080:80 -e NODE_ENV=production -n my-test
```

Cleanup all local tags/containers for this image:

```bash
prim clean
```

The clean command now features:
- **Interactive multi-select**: Choose which images to clean using checkbox interface
- **Smart auto-selection**: All relevant images (tracked + found on system) are pre-selected
- **Persistent preferences**: Your deselection choices are remembered for future cleanups
- **Space to toggle**: Use spacebar to select/deselect images
- **Y/N to save**: Choose whether to save your preferences for next time

Cleanup a specific tag (prefixing v is optional):

```bash
prim clean -t v20250809-123456
prim clean -t 20250809-123456
```

## Image Tracking

`prim` automatically tracks built images to improve workflow efficiency:

- **Storage Location**: Images are tracked in `/var/tmp/prim-images` (Linux/Unix) or system temp directory (Windows)
- **Automatic Cleanup**: Stale tracking data (>7 days old) is automatically cleaned up
- **Interactive Selection**: When running `test` or `deploy` without specifying a tag, you can choose from previously built images
- **Storage Info**: Use `prim status -v` to see tracking storage information and recent builds

The tracking system stores metadata like build time, image size, and build arguments, but not the actual Docker images.

## Enhanced Cleanup System

The `clean` command provides intelligent cleanup with persistent user preferences:

- **Auto-discovery**: Automatically finds all relevant images (both tracked and on the Docker system)
- **Interactive selection**: Multi-select interface with checkbox controls
- **Persistent preferences**: Remembers which images you choose to keep across cleanup sessions
- **Smart pre-selection**: Images are automatically selected based on your previous choices
- **Comprehensive cleanup**: Removes containers, images, and tracking metadata in one operation

Use `prim clean` to start an interactive cleanup session, or `prim clean --yes` to clean all images without prompting.
