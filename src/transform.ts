import { readFile, writeFile } from 'node:fs/promises';
import picomatch from 'picomatch';
import type { SyncTransform, ReplaceRule, TransformContext } from './types';

/**
 * A transform with its `match` globs already compiled into a matcher.
 */
export interface CompiledTransform {
  isMatch: (path: string) => boolean;
  replace: ReplaceRule[];
}

// Strict decoder: it throws on invalid UTF-8 and keeps the BOM so files round-trip untouched.
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Validate the shape of a list of transforms, failing fast before any repository is cloned.
 */
export function validateTransforms(transforms: SyncTransform[] | undefined, label: string): void {
  if (transforms === undefined) return;

  if (!Array.isArray(transforms)) {
    throw new Error(`${label}: "transforms" must be an array.`);
  }

  transforms.forEach((transform, index) => {
    const where = `${label}, transform #${index + 1}`;
    const patterns = ([] as string[]).concat(transform.match ?? []);

    // An explicit glob is mandatory so unrelated or binary files are never touched by accident.
    if (patterns.length === 0 || patterns.some((p) => typeof p !== 'string' || p === '')) {
      throw new Error(`${where}: "match" must be a non-empty glob or array of globs.`);
    }

    if (!Array.isArray(transform.replace) || transform.replace.length === 0) {
      throw new Error(`${where}: "replace" must be a non-empty array of { from, to } rules.`);
    }

    for (const rule of transform.replace) {
      // An empty `from` would match between every character.
      if (typeof rule.from !== 'string' || rule.from === '') {
        throw new Error(`${where}: every replace rule needs a non-empty string "from".`);
      }
      if (typeof rule.to !== 'string' && typeof rule.to !== 'function') {
        throw new Error(
          `${where}: replace rule for "${rule.from}" needs "to" as a string or a function.`,
        );
      }
    }
  });
}

/**
 * Compile the `match` globs of each transform once, so they can be reused for every file.
 */
export function compileTransforms(transforms: SyncTransform[]): CompiledTransform[] {
  return transforms.map((transform) => {
    const matcher = picomatch(transform.match, { dot: true });
    return {
      isMatch: (path: string) => matcher(path),
      replace: transform.replace,
    };
  });
}

/**
 * Decode a buffer as text. Returns undefined when it looks binary (NUL bytes
 * or invalid UTF-8), since writing it back would corrupt the file.
 */
function decodeText(buffer: Buffer): string | undefined {
  if (buffer.includes(0)) return undefined;
  try {
    return textDecoder.decode(buffer);
  } catch {
    return undefined;
  }
}

/**
 * Apply the replacements of the given transforms, in order, to a text content.
 */
function applyTransforms(
  content: string,
  transforms: CompiledTransform[],
  ctx: TransformContext,
): { content: string; replacements: number } {
  let replacements = 0;

  for (const transform of transforms) {
    for (const { from, to } of transform.replace) {
      const occurrences = content.split(from).length - 1;
      if (occurrences === 0) continue;

      const value = typeof to === 'function' ? to(ctx) : to;
      if (typeof value !== 'string') {
        throw new Error(`Replacement for "${from}" in ${ctx.file.path} did not return a string.`);
      }

      // split/join replaces every occurrence literally ($ patterns in `value` are not special).
      content = content.split(from).join(value);
      replacements += occurrences;
    }
  }

  return { content, replacements };
}

/**
 * Rewrite an already copied file with the transforms whose `match` selects it.
 * The source file (the cached clone) is only read, never modified.
 */
export async function transformFile(
  src: string,
  dest: string,
  transforms: CompiledTransform[],
  ctx: TransformContext,
): Promise<void> {
  const matching = transforms.filter((transform) => transform.isMatch(ctx.file.path));
  if (matching.length === 0) return;

  const text = decodeText(await readFile(src));
  if (text === undefined) {
    console.log(`    - Skipped transforms (not a UTF-8 text file): ${ctx.file.path}`);
    return;
  }

  const { content, replacements } = applyTransforms(text, matching, ctx);
  if (replacements === 0) return;

  // The file was copied just before, so overwriting it keeps the original permissions.
  await writeFile(dest, content, 'utf8');
  console.log(`    - Transformed: ${ctx.file.path} (${replacements} replacement(s))`);
}
