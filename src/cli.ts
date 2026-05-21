import { Command } from 'commander';
import { resolve } from 'node:path';
import { sync } from './index';
import { loadConfigFile, resolveConfigFilePath } from './config-loader';
import type { Syncfile } from './types';

const program = new Command();

program
  .name('repo-sync')
  .description('Sync files from one or more remote Git repositories using a local syncfile')
  .option('-f, --file <path>', 'path to a syncfile')
  .option('-c, --cache-root <dir>', 'base directory for repository caches', '.cache/repo-sync')
  .option(
    '-t, --target <dir>',
    'root target directory (can be overridden per source)',
    process.cwd(),
  )
  .option('--gitignore', 'Create automatic .gitignore entries for all sources', false)
  .action(async (options) => {
    let filePath: string | undefined;

    if (options.file) {
      filePath = resolve(options.file);
    } else {
      filePath = await resolveConfigFilePath();
      if (!filePath) {
        program.error(
          'No syncfile found. Create a syncfile.json, syncfile.js, syncfile.mjs, or syncfile.cjs in your project directory.',
        );
        return;
      }
      console.log(`(i) Using auto-discovered config: ${filePath}`);
    }

    let config: Syncfile;
    try {
      config = await loadConfigFile(filePath);
    } catch (err) {
      program.error(`Failed to load syncfile "${filePath}": ${(err as Error).message}`);
      return;
    }

    // accept a single object or an array of sources
    const sources = Array.isArray(config) ? config : [config];

    await sync({
      sources,
      cacheRoot: options.cacheRoot,
      targetDir: options.target,
      addToGitignore: options.gitignore,
    });
  });

program.parse();
