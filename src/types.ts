/**
 * Top-level configuration: it can be a single source or an array of sources.
 */
export type Syncfile = SyncSource | SyncSource[];

/**
 * A single sync source defined in the syncfile.
 */
export interface SyncSource {
  /**
   * Friendly name for the source (used in cache folder and logs)
   */
  name?: string;

  /**
   * Direct repository clone URL (e.g., https://github.com/owner/repo.git)
   */
  repo: string;

  /**
   * Branch to track
   */
  branch?: string;

  /**
   * Glob patterns to include (relative to repo root). Defaults to ['**​/*']
   */
  include?: string[];

  /**
   * Glob patterns to exclude
   */
  exclude?: string[];

  /**
   * Sub-directory under the global target directory where files will be placed.
   * If not set, files go directly into the global target directory.
   */
  target?: string;

  /**
   * Whether to add copied files to .gitignore.
   * If omitted, the global `addToGitignore` setting (default true) is used.
   */
  gitignore?: boolean;
}

/**
 * Options passed to the main `sync()` function.
 */
export interface SyncOptions {
  /**
   * Array of source configurations
   * (from the syncfile)
   */
  sources: SyncSource[];

  /**
   * Base directory for cached clones
   * (defaults to `.cache/repo-sync`)
   */
  cacheRoot?: string;

  /**
   * Root directory where files will be copied
   * (defaults to cwd)
   */
  targetDir?: string;

  /**
   * Global default for whether to add .gitignore entries
   * (default true)
   */
  addToGitignore?: boolean;
}
