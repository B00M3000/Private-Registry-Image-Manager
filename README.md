# Container Deploy CLI

A generalized Node.js CLI to build and push Docker images to private registries with auto tag generation and optional `latest` tagging.

## Features

- Config-driven build and deploy
- Auto tag generation: timestamp, git commit, git tag, semver, manual
- Optional `latest` tagging
- Docker login support
- DNS check for registry host

## Install

With pnpm:

```bash
pnpm install
pnpm run build
pnpm link --global
# then use `container-deploy` globally
```

## Usage

Initialize config:

```bash
container-deploy init
```

Build:

```bash
container-deploy build
```

Deploy:

```bash
container-deploy deploy
```

## Config

Creates a `container-deploy.yml` by default with the following shape:

```yaml
project:
  name: my-app
  version: 1.0.0
  dockerfile: ./Dockerfile
registry:
  url: registry.example.com
  repository: my/app
  username: "${REGISTRY_USERNAME}"
  password: "${REGISTRY_PASSWORD}"
docker:
  localImageName: my-app
  buildArgs: {}
  buildContext: .
deployment:
  tagStrategy: git_commit # timestamp|git_commit|git_tag|manual|semver
  autoCleanup: false
  pushLatest: true
  dnsCheck: true
```

Set credentials via env vars if not in config: `REGISTRY_USERNAME` and `REGISTRY_PASSWORD`.

## Release and publish to npm

This repo includes a GitHub Actions workflow that publishes on tag pushes matching `v*`.

Steps:

1. Add `NPM_TOKEN` secret in your GitHub repository settings.
2. Bump version in `package.json`.
3. Create and push a tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will build with pnpm and publish to npm.
