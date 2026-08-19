import { spawn } from 'child_process';

const NEXT_BIN = require.resolve('next/dist/bin/next');

export interface NextServerHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * Starts a production Next.js server (`next start`) for the given project
 * root and resolves once it reports it's ready, returning the port it
 * actually bound - including when asked for port 0 (let the OS assign a
 * free one) - and a close() to shut it down.
 *
 * Used by the test suite to crawl the real bundled demo App Router page
 * (see app/demo/) with an actual running Next.js server, rather than
 * mocking the page or hand-rolling a static file server - it's a real
 * React route, not static HTML, so it needs real Next.js rendering to
 * test against.
 *
 * Requires `next build` to have already produced a `.next/` directory in
 * rootDir (see the `pretest` npm script) - this only starts the server, it
 * doesn't build.
 *
 * @param rootDir project root (containing .next/)
 * @param port fixed port, or 0 to let the OS pick a free one
 */
export function startNextServer(rootDir: string, port = 0): Promise<NextServerHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(port)], {
      cwd: rootDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    let output = '';

    function settleResolve(actualPort: number) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      resolve({
        port: actualPort,
        close: () =>
          new Promise((res) => {
            child.once('exit', () => res());
            child.kill();
          }),
      });
    }

    function settleReject(err: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    }

    function onData(chunk: Buffer | string) {
      output += chunk.toString();
      const match = output.match(/https?:\/\/(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d+)/);
      if (match) settleResolve(Number(match[1]));
    }

    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    child.on('error', settleReject);
    child.on('exit', (code) => {
      settleReject(new Error(`next start exited early (code ${code}):\n${output}`));
    });

    const timeout = setTimeout(() => {
      child.kill();
      settleReject(new Error(`next start did not report a listening URL within 20s:\n${output}`));
    }, 20000);
  });
}
