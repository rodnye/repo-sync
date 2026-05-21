import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Syncfile } from './types';

const CONFIG_CANDIDATES = ['syncfile.json', 'syncfile.js', 'syncfile.mjs', 'syncfile.cjs'];

/**
 * Locate the first existing syncfile configuration file in the current
 * working directory. Returns the resolved file path or undefined if none
 * of the candidate names exist.
 */
export async function resolveConfigFilePath(): Promise<string | undefined> {
  for (const candidate of CONFIG_CANDIDATES) {
    const filePath = resolve(candidate);
    try {
      await access(filePath);
      return filePath;
    } catch {
      // file does not exist – keep trying
    }
  }
  return undefined;
}

/**
 * Load a syncfile configuration from the given path.
 *
 * Supported formats:
 * - `.json` – parsed as JSON
 * - `.js`, `.cjs` – required as CommonJS module; `module.exports` is used.
 *   If the result is an object with a `default` key, that value is preferred
 *   (this allows compatibility with TypeScript `export default` compiled to
 *   CJS interop).
 * - `.mjs` – dynamically imported; `export default` is extracted.
 */
export async function loadConfigFile(filePath: string): Promise<Syncfile> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Syncfile;
  }

  if (ext === 'js' || ext === 'cjs') {
    const required = require(filePath);
    // Handle default-export interop (e.g. TypeScript ESM → CJS).
    if (required && typeof required === 'object' && 'default' in required) {
      return required.default as Syncfile;
    }
    return required as Syncfile;
  }

  if (ext === 'mjs') {
    const module = await import(pathToFileURL(filePath).href);
    if (module && typeof module === 'object' && 'default' in module) {
      return module.default as Syncfile;
    }
    return module as Syncfile;
  }

  throw new Error(`Unsupported config file extension: .${ext}`);
}
