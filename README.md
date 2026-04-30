# repo-sync

Synchronize specific files from remote Git repositories into your local project using a declarative JSON manifest.

## Purpose

This tool acts as a bridge between separate repositories, allowing files to exist in your project at runtime without manually copying or maintaining forks. It also serves to keep specified files in sync with their upstream sources.

Common use cases:

- Pull shared configurations, CI workflows, or utility scripts from a separate repository into multiple projects
- Keep documentation snippets or data files synchronized with their canonical source
- Compose a project from files scattered across different repositories without vendoring them

## Installation

```bash
npm install -g git-repo-sync
```

## Quick Start

Create a `syncfile.json`:

```json
{
  "repo": "https://github.com/owner/repo.git",
  "branch": "main",
  "include": ["docs/*.md"],
  "target": "./synced-docs"
}
```

Run:

```bash
repo-sync
```

Files matching `docs/*.md` from the remote repository will be copied into `./synced-docs`.

## Configuration

The syncfile accepts a single source object or an array of sources. Each source requires:

| Field       | Required | Description                                                                     |
| ----------- | -------- | ------------------------------------------------------------------------------- |
| `repo`      | Yes      | Git repository clone URL                                                        |
| `branch`    | No       | Branch to track (defaults to the remote default branch)                         |
| `include`   | No       | Glob patterns for files to sync (defaults to `**/*`)                            |
| `exclude`   | No       | Glob patterns to exclude                                                        |
| `target`    | No       | Target directory within the project (defaults to current directory)             |
| `mappings`  | No       | Array of fine-grained mapping rules (takes precedence over `include`/`exclude`) |
| `gitignore` | No       | Whether to add synced files to `.gitignore` (defaults to `true`)                |

### Mapping Rules

Each entry in `mappings` supports:

| Field     | Required | Description                                                                                |
| --------- | -------- | ------------------------------------------------------------------------------------------ |
| `include` | Yes      | Glob pattern(s) for files to match                                                         |
| `exclude` | No       | Glob pattern(s) to exclude from matches                                                    |
| `dest`    | Yes      | Destination path; ends with `/` for a directory, otherwise treated as a single file rename |

## CLI Options

```
Usage: repo-sync [options]

Options:
  -f, --file <path>       path to the local syncfile.json (default: "syncfile.json")
  -c, --cache-root <dir>  base directory for repository caches (default: ".cache/repo-sync")
  -t, --target <dir>      root target directory (default: current working directory)
  --gitignore             create .gitignore entries for synced files
```

## Examples

Sync a single file from one repository:

```json
{
  "repo": "https://github.com/owner/repo.git",
  "branch": "main",
  "include": ["LICENSE"],
  "target": "./legal"
}
```

Sync multiple repositories with explicit mappings:

```json
[
  {
    "name": "astro-blog",
    "repo": "https://github.com/author/astro-blog.git",
    "branch": "main",
    "target": "./dist/content",
    "mappings": [
      {
        "include": ["src/data/post/*.md"],
        "dest": "posts/"
      },
      {
        "include": ["src/data/post/featured-post.mdx"],
        "dest": "featured.mdx"
      }
    ]
  },
  {
    "name": "ci-workflows",
    "repo": "https://github.com/org/shared-workflows.git",
    "branch": "main",
    "target": "./dist",
    "mappings": [
      {
        "include": [".github/workflows/deploy.yml"],
        "dest": ".github/workflows/shared-deploy.yml"
      }
    ]
  }
]
```

## How It Works

1. Reads the syncfile manifest
2. Clones each repository (shallow clone) into a local cache directory, or updates it if already cached
3. Copies matched files to the target directories
4. Optionally appends entries to `.gitignore` to prevent accidental commits of synced files

Repositories are cached in `.cache/repo-sync` by default and only fetched on subsequent runs.
