import { access, appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';
import simpleGit, { CheckRepoActions } from 'simple-git';
import glob from 'fast-glob';
import type { SyncOptions, SyncSource, Syncfile } from './types';

/**
 * Ensure a shallow clone of the repository exists and is up-to-date
 * (fetched + reset to remote branch).
 *
 * @param repoUrl  - Git clone URL
 * @param branch   - Branch to check out
 * @param cacheDir - Local directory for the clone
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
    console.log(`    + Added "${entry}" to ${gitignorePath}`);
  }
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
    const { branch } = await ensureRepoClone(source.repo, source.branch, sourceCacheDir);;

    console.log(`\n~ Syncing source "${sourceName}"`);
    console.log(`  ▸ Repo: ${source.repo}  Branch: ${branch}`);

    // 2. Gather files using include/exclude patterns
    const include = source.include ?? ['**/*'];
    const exclude = source.exclude ?? [];
    const filesToCopy = await glob(include, {
      cwd: sourceCacheDir,
      ignore: exclude,
      dot: true,
      onlyFiles: true,
    });

    console.log(`  ▸ Found ${filesToCopy.length} file(s) to copy.`);

    // 3. Copy files and optionally update .gitignore
    for (const relativePath of filesToCopy) {
      const src = join(sourceCacheDir, relativePath);
      const dest = resolve(sourceTarget, relativePath);
      const destDir = dirname(dest);
      const fileName = relativePath.split('/').pop()!;

      console.log(`    - Copying: ${relativePath}`);
      await mkdir(destDir, { recursive: true });
      await copyFile(src, dest);

      if (sourceGitignore) {
        await appendToGitignoreIfMissing(destDir, fileName);
      }
    }

    console.log(`  ✓ Source "${sourceName}" synced.`);
  }

  console.log(`\n✓ All sources processed. Cache kept under ${cacheRoot}`);
}

export type { SyncOptions, SyncSource, Syncfile };