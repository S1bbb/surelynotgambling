import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.local.config.ts'], { cwd: 'web', stdio: 'inherit' })];
for (const child of children) child.on('exit', () => { for (const other of children) other.kill(); });
process.on('SIGINT', () => { for (const child of children) child.kill(); });
