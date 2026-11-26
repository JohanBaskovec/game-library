import path from 'node:path';
import { buildCatalog, findLogic } from '@game-library/registry/logics';
import { startServer } from './server.ts';

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a whole number`);
  return parsed;
}

const port = numberFromEnv('PORT', 8787);
const host = process.env.HOST ?? '0.0.0.0';
const clientDist =
  process.env.CLIENT_DIST ?? path.resolve(import.meta.dirname, '../../client/dist');
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : null;

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

const server = await startServer({
  port,
  host,
  clientDist,
  allowedOrigins,
  trustProxy: process.env.TRUST_PROXY === '1',
  maxRooms: numberFromEnv('MAX_ROOMS', 500),
  limits: {
    roomsPerAddressBurst: numberFromEnv('ROOMS_PER_ADDRESS_BURST', 10),
    roomsPerAddressPerMinute: numberFromEnv('ROOMS_PER_ADDRESS_PER_MINUTE', 10),
    socketsPerAddress: numberFromEnv('SOCKETS_PER_ADDRESS', 30),
    unknownRoomsPerAddressBurst: numberFromEnv('UNKNOWN_ROOMS_PER_ADDRESS_BURST', 20),
  },
  env: { game: findLogic },
  catalog: buildCatalog(),
  log,
});

log(`listening on port ${server.port}, serving the website from ${clientDist}`);

async function stop(signal: string): Promise<void> {
  log(`${signal} received, stopping`);
  await server.close();
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
