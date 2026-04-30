import { access, appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { cwd } from 'node:process';
import simpleGit, { CheckRepoActions } from 'simple-git';
import glob from 'fast-glob';
import type { SyncOptions, SyncSource, Syncfile, MappingRule } from './types';

/**
 * Ensure a shallow clone of the repository exists and is up-to-date
 * (fetched + reset to remote branch).
 */
async function ensureRepoClone(
  repoUrl: string,
  branch: string | undefined,
  cacheDir: string,
): Promise<{ url: string; branch: string }> {
  await mkdir(cacheDir, { recursive: true });
  const git = simpleGit(cacheDir);

  const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);

  if (!isRepo) {
    console.log(`▸ Cloning ${repoUrl} ${branch ? `(${branch}) ` : ''}into ${cacheDir}`);
    await git.clone(repoUrl, '.', ['--depth', '1', ...(branch ? ['--branch', branch] : [])]);
    if (!branch) branch = (await git.branch()).current;
  } else {
    if (!branch) branch = (await git.branch()).current;
    console.log(`▸ Updating ${cacheDir} to origin/${branch}`);
    await git.fetch('origin', branch);
    await git.reset(['--hard', `origin/${branch}`]);
  }

  return {
    branch: branch!,
    url: repoUrl,
  };
}

/**
 * Ensure a .gitignore file exists at the given path, creating one with a minimal header if missing.
 */
async function ensureGitignore(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, '.gitignore\n');
  }
}

/**
 * Append an entry to a .gitignore file if it does not already appear (on its own line).
 */
async function appendToGitignoreIfMissing(dir: string, entry: string): Promise<void> {
  const gitignorePath = join(dir, '.gitignore');
  await ensureGitignore(gitignorePath);
  const content = await readFile(gitignorePath, 'utf8');
  if (!content.includes('\n' + entry)) {
    await appendFile(gitignorePath, `${entry}\n`);
  }
}

/**
 * Process a single mapping rule: find files and compute their destination paths.
 */
async function processMapping(
  mapping: Omit<MappingRule, 'include'> & { include: string[] },
  repoRoot: string,
  destBase: string,
): Promise<Array<{ src: string; dest: string }>> {
  const files = await glob(mapping.include, {
    cwd: repoRoot,
    ignore:
      typeof mapping.exclude === 'undefined'
        ? []
        : typeof mapping.exclude === 'string'
          ? [mapping.exclude]
          : mapping.exclude,
    dot: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    console.log(`    - No files matched patterns: ${mapping.include.join(', ')}`);
    return [];
  }

  const isDestDirectory = mapping.dest.endsWith('/') || mapping.dest === '';
  const operations: Array<{ src: string; dest: string }> = [];

  for (const relativePath of files) {
    let destRelative: string;

    if (isDestDirectory) {
      destRelative = join(mapping.dest, basename(relativePath));
    } else {
      // Destination is a specific file path. Check that we only matched one file.
      if (files.length > 1) {
        throw new Error(
          `Mapping with dest "${mapping.dest}" is a file, but patterns matched multiple files: ` +
            files.join(', ') +
            '. Use a directory dest (ending with /) or narrow the pattern to a single file.',
        );
      }
      destRelative = mapping.dest;
    }

    const src = join(repoRoot, relativePath);
    const dest = resolve(destBase, destRelative);
    operations.push({ src, dest });
  }

  return operations;
}

/**
 * Sync files from one or more remote Git repositories according to a `syncfile.json` manifest.
 */
export async function sync(options: SyncOptions): Promise<void> {
  const sources = options.sources ?? [];
  const cacheRoot = options.cacheRoot ?? join(cwd(), '.cache', 'repo-sync');
  const targetDir = options.targetDir ?? cwd();
  const globalGitignore = options.addToGitignore ?? true;

  for (const source of sources) {
    const sourceName = source.name ?? source.repo.replace(/[^a-zA-Z0-9]/g, '_');
    const sourceTarget = source.target ? resolve(targetDir, source.target) : targetDir;
    const sourceGitignore = source.gitignore ?? globalGitignore;
    const sourceCacheDir = join(cacheRoot, sourceName);

    // 1. Ensure repository clone
    const { branch } = await ensureRepoClone(source.repo, source.branch, sourceCacheDir);

    console.log(`\n~ Syncing source "${sourceName}"`);
    console.log(`  ▸ Repo: ${source.repo}  Branch: ${branch}`);

    // 2. Determine the mapping rules to use
    let mappings: MappingRule[];
    if (source.mappings && source.mappings.length > 0) {
      mappings = source.mappings;
    } else {
      // Fallback to include/exclude if no mappings provided
      const legacyInclude = source.include ?? ['**/*'];
      const legacyExclude = source.exclude ?? [];
      mappings = [
        {
          include: legacyInclude,
          exclude: legacyExclude,
          dest: '',
        },
      ];
    }

    // 3. Process each mapping rule
    let totalCopied = 0;
    for (const mapping of mappings) {
      const include = typeof mapping.include == 'string' ? [mapping.include] : mapping.include;

      try {
        const operations = await processMapping(
          { ...mapping, include },
          sourceCacheDir,
          sourceTarget,
        );
        if (operations.length === 0) continue;

        console.log(`  ▸ Rule: include=[${include.join(', ')}] → dest="${mapping.dest || '.'}"`);

        for (const { src, dest } of operations) {
          const destDir = dirname(dest);
          const fileName = basename(dest);

          console.log(`    - Copying: ${basename(src)} → ${dest}`);
          await mkdir(destDir, { recursive: true });
          await copyFile(src, dest);

          if (sourceGitignore) {
            await appendToGitignoreIfMissing(destDir, fileName);
          }
          totalCopied++;
        }
      } catch (err) {
        throw new Error(`  ✗ Error processing mapping: ${(err as Error).message}`);
      }
    }

    console.log(`  ✓ Source "${sourceName}" synced. ${totalCopied} file(s) copied.`);
  }

  console.log(`\n✓ All sources processed. Cache kept under ${cacheRoot}`);
}

export type { SyncOptions, SyncSource, Syncfile };
