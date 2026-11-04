/**
 * Top-level configuration: it can be a single source or an array of sources.
 */
export type Syncfile = SyncSource | SyncSource[];

/**
 * Context injected into dynamic replacement values (a `to` function).
 */
export interface TransformContext {
  /**
   * Source being synced. `branch` is the effective branch, even when the
   * source did not declare one.
   */
  source: {
    name: string;
    repo: string;
    branch: string;
  };

  /**
   * Absolute target directory of the source.
   */
  target: {
    dir: string;
  };

  /**
   * File being transformed: its path relative to the repo root (forward
   * slashes) and its absolute destination path.
   */
  file: {
    path: string;
    dest: string;
  };
}

/**
 * A literal replacement applied to the content of a file.
 */
export interface ReplaceRule {
  /**
   * Exact text to look for. Every occurrence is replaced (no regex, no escaping).
   */
  from: string;

  /**
   * Replacement value. Use a function to compute it from the injected context
   * (only possible in JS/TS configs or when calling `sync()` programmatically).
   */
  to: string | ((ctx: TransformContext) => string);
}

/**
 * A set of replacements applied to the text files matched by `match`.
 */
export interface SyncTransform {
  /**
   * Glob patterns (relative to repo root) selecting the files to transform.
   * Required: transforms are never applied to "all files" implicitly.
   */
  match: string | string[];

  /**
   * Replacements to apply, in order, to every matched file.
   */
  replace: ReplaceRule[];
}

/**
 * A mapping rule defines a set of files to include and their destination.
 */
export interface MappingRule {
  /**
   * Glob patterns to include (relative to repo root).
   */
  include: string | string[];

  /**
   * Glob patterns to exclude from the included set.
   */
  exclude?: string | string[];

  /**
   * Relative destination directory or file path.
   *
   * - If it ends with '/', it is treated as a directory and matched files
   *   are copied into it preserving their relative structure.
   * - If it does not end with '/', it is treated as a file path. This only
   *   works when the `include` pattern matches exactly one file. The file
   *   will be copied and renamed to this path.
   */
  dest: string;

  /**
   * Content transforms applied only to the files copied by this mapping,
   * after the source-level `transforms`.
   */
  transforms?: SyncTransform[];
}

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
   * Sub-directory under the global target directory where files will be
   * placed by default. This acts as the base for all `dest` paths in
   * the `mappings` if no `mappings` are provided, a basic mapping of
   * `include: ['** /*'], dest: ''` is used.
   */
  target?: string;

  /**
   * Detailed file mapping rules for maximum control.
   */
  mappings?: MappingRule[];

  /**
   * Glob patterns to include (relative to repo root).
   * Only used if `mappings` is not provided.
   */
  include?: string[];

  /**
   * Glob patterns to exclude.
   * Only used if `mappings` is not provided.
   */
  exclude?: string[];

  /**
   * Whether to add copied files to .gitignore.
   * If omitted, the global `addToGitignore` setting (default true) is used.
   */
  gitignore?: boolean;

  /**
   * Content transforms applied to every file copied from this source,
   * before any mapping-level `transforms`. Works with or without `mappings`.
   */
  transforms?: SyncTransform[];
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
