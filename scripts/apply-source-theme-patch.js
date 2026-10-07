import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Keep the customization in the parent repo without repointing the upstream submodule.
const theme = fileURLToPath(new URL('../ghost/core/content/themes/source/', import.meta.url));
const patch = fileURLToPath(new URL('./theme-patches/source-reading-time.patch', import.meta.url));
const run = args => spawnSync('git', ['-C', theme, 'apply', ...args, patch], {encoding: 'utf8'});

if (run(['--reverse', '--check']).status !== 0) {
    const result = run([]);
    if (result.status !== 0) {
        console.error(result.stderr || 'Could not apply the Source reading-time patch.');
        process.exit(1);
    }
}
