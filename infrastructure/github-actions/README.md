# GitHub Actions

The repository CI workflow lives in `.github/workflows/ci.yml` so GitHub runs it automatically. It installs workspaces, builds the shared domain package, runs node tests, and type-checks workspaces that expose a `lint` script.
