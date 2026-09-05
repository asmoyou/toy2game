import { spawn } from 'node:child_process';
import net from 'node:net';
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

export async function freePort(preferred) {
  for (let port = preferred; port < 65536; port++) {
    const available = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
      server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('No available development port.');
}
