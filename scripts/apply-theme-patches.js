import {spawnSync} from 'node:child_process';
import path from 'node:path';

// Keep local theme changes in the parent repository, without changing the
// upstream submodule revision. Reverse-check makes repeated setup idempotent.
const theme = path.resolve(import.meta.dirname, '../ghost/core/content/themes/source');
const patch = path.resolve(import.meta.dirname, 'theme-patches/source-reading-time.patch');
const applied = spawnSync('git', ['-C', theme, 'apply', '--reverse', '--check', patch], {stdio: 'ignore'});

if (applied.status !== 0) {
    const result = spawnSync('git', ['-C', theme, 'apply', patch], {stdio: 'inherit'});
    process.exit(result.status ?? 1);
}
