import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Source is an upstream submodule. Keep local theme changes in the parent
// repository and apply them when building assets for development or release.
const theme = fileURLToPath(new URL('../content/themes/source/', import.meta.url));
const patch = fileURLToPath(new URL('./theme-patches/source-reading-time.patch', import.meta.url));
const apply = args => spawnSync('git', ['apply', ...args, patch], {cwd: theme, encoding: 'utf8'});

if (apply(['--reverse', '--check']).status !== 0) {
    const result = apply([]);
    if (result.status !== 0) {
        throw new Error(`Unable to apply Source reading-time patch: ${result.stderr || result.error}`);
    }
}
