import { spawn } from 'node:child_process';
import { root } from './catalog.mjs';

export function start(command, args, options = {}) {
  return spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
}

export async function run(command, args, options) {
  const child = start(command, args, options);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}
