import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { HostAddress } from '@game-library/host-conformance';

/**
 * Starts the real Worker on Cloudflare's own runtime (workerd, through `wrangler dev`), with a throwaway
 * configuration: the same code and Durable Objects as `wrangler.jsonc`, a small home page instead of the built
 * website, and the limits the test asks for. Nothing is deployed and nothing leaves this machine.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const STARTUP_TIMEOUT_MS = 80_000;

export interface WranglerHost extends HostAddress {
  stop(): Promise<void>;
  /** The text wrangler printed so far, for explaining a failure. */
  output(): string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export async function startWranglerHost(vars: Record<string, string>): Promise<WranglerHost> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'gl-wrangler-'));
  const assets = path.join(folder, 'assets');
  await mkdir(assets);
  await writeFile(
    path.join(assets, 'index.html'),
    '<!doctype html><title>Conformance home</title>',
  );
  const config = path.join(folder, 'wrangler.jsonc');
  await writeFile(
    config,
    JSON.stringify({
      name: 'game-library-test',
      main: path.join(PACKAGE_ROOT, 'src/worker.ts'),
      compatibility_date: '2026-11-26',
      assets: { directory: assets, run_worker_first: ['/api/*'] },
      durable_objects: {
        bindings: [
          { name: 'ROOMS', class_name: 'RoomDO' },
          { name: 'LIMITER', class_name: 'LimiterDO' },
        ],
      },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['RoomDO', 'LimiterDO'] }],
      vars,
    }),
  );

  const port = await freePort();
  const child: ChildProcess = spawn(
    path.join(REPOSITORY_ROOT, 'node_modules/.bin/wrangler'),
    [
      'dev',
      '--config',
      config,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--persist-to',
      path.join(folder, 'state'),
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: folder,
      detached: true, // Its own process group, so stopping it also stops workerd.
      env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  const collect = (chunk: Buffer) => {
    output += chunk.toString('utf8');
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  const stop = async (): Promise<void> => {
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
          } catch {
            // Already gone.
          }
          resolve();
        }, 5000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await rm(folder, { recursive: true, force: true });
  };

  const started = Date.now();
  for (;;) {
    if (output.includes(`Ready on http://127.0.0.1:${port}`)) break;
    if (child.exitCode !== null || Date.now() - started > STARTUP_TIMEOUT_MS) {
      await stop();
      throw new Error(`wrangler dev did not start:\n${output.slice(-3000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    http: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}`,
    stop,
    output: () => output,
  };
}
