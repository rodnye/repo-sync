import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sync } from './index';
import type { Syncfile } from './types';

const program = new Command();

program
  .name('repo-sync')
  .description('Sync files from one or more remote Git repositories using a local syncfile.json')
  .option('-f, --file <path>', 'path to the local syncfile.json', 'syncfile.json')
  .option('-c, --cache-root <dir>', 'base directory for repository caches', '.cache/repo-sync')
  .option(
    '-t, --target <dir>',
    'root target directory (can be overridden per source)',
    process.cwd(),
  )
  .option('--gitignore', 'Create automatic .gitignore entries for all sources', false)
  .action(async (options) => {
    const filePath = resolve(options.file);
    let config: Syncfile;

    try {
      const raw = await readFile(filePath, 'utf-8');
      config = JSON.parse(raw);
    } catch (err) {
      program.error(`Failed to read syncfile "${filePath}": ${(err as Error).message}`);
      return;
    }

    //accept a single object or an array of sources
    const sources = Array.isArray(config) ? config : [config];

    await sync({
      sources,
      cacheRoot: options.cacheRoot,
      targetDir: options.target,
      addToGitignore: options.gitignore,
    });
  });

program.parse();
