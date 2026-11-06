import { createServer } from 'node:http';
import { readFile, mkdir, rename, writeFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePrivateConfig } from './private-config.mjs';
import { normalizeSiteProfile } from '../sites/profiles.mjs';
import { collectWeather } from './collect-weather.mjs';
import { publicWeatherFiles, mergeWeatherState } from '../weather/state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const within = (directory, file) => {
  const relative = path.relative(directory, file);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };

// API weather collection is independent of future server modules (nowcasting/radar and archives).
// Those modules will have their own configuration, cadence and durable storage.
export async function createWeatherServer({ config, stateFile, siteDirectory, releaseNumber = '',
  collectImpl = collectWeather, onErrors = () => {} }) {
  const profile = normalizeSiteProfile(config.site);
  if (profile.apiMode !== 'server') throw new Error('Le serveur de collecte nécessite apiMode: server.');
  stateFile = path.resolve(stateFile);
  const siteRoot = siteDirectory ? await realpath(siteDirectory) : null;
  if (siteRoot && within(siteRoot, stateFile)) throw new Error('Le cache privé doit rester hors du dossier public.');
  let entry = await readFile(stateFile, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return {};
    throw new Error('Cache météo illisible.', { cause: error });
  });
  if (entry.siteId && (entry.siteId !== profile.id || entry.latitude !== profile.latitude || entry.longitude !== profile.longitude)) throw new Error('Le cache appartient à un autre lieu.');
  await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  let saving = Promise.resolve();
  const checkpoint = value => {
    const write = saving.then(async () => {
      const merged = mergeWeatherState(entry, value);
      await writeFile(stateFile + '.tmp', JSON.stringify(merged), { mode: 0o600 });
      await rename(stateFile + '.tmp', stateFile);
      entry = merged;
    });
    saving = write.catch(() => {});
    return write;
  };
  // PIAF and forecasts have independent lanes, so a long model download cannot delay PIAF.
  // Writes merge under one lock; an older lane cannot replace a newer acquisition.
  const pending = new Map();
  const refresh = (group = 'all') => {
    if (!['all', 'piaf', 'forecast'].includes(group)) throw new Error('Groupe de collecte inconnu.');
    if (pending.has(group)) return pending.get(group);
    const operation = (group === 'all' ? Promise.all([refresh('piaf'), refresh('forecast')]).then(results => ({ errors: results.reduce((sum, result) => sum + result.errors, 0) })) : (async () => {
      const result = await collectImpl({ profile, entry: structuredClone(entry), token: config.meteoFranceToken, group, checkpoint });
      await checkpoint(result.entry);
      if (result.errors.length) onErrors(result.errors.map(({ source, message }) => ({ source,
        message: String(message || 'Collecte indisponible ; acquisitions précédentes conservées.')
          .split(config.meteoFranceToken || '\0').join('[masqué]') })));
      return { errors: result.errors.length };
    })()).finally(() => { pending.delete(group); });
    pending.set(group, operation);
    return operation;
  };
  const apiRoot = new URL(profile.apiBaseUrl).pathname;
  const sitePath = profile.publicUrl ? new URL(profile.publicUrl).pathname : '/';
  const allowedOrigin = profile.publicUrl ? new URL(profile.publicUrl).origin : null;
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (allowedOrigin && request.headers.origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');
    }
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        return send(405, JSON.stringify({ error: 'Méthode non autorisée.' }));
      }
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith(apiRoot + 'api/')) {
        const resource = url.pathname.slice((apiRoot + 'api/').length);
        if (!['dashboard', 'week', 'config'].includes(resource)) return send(404, '{}');
        for (const [key, coordinate] of [['lat', profile.latitude], ['lon', profile.longitude]]) {
          if (url.searchParams.has(key) && Number(url.searchParams.get(key)) !== coordinate) return send(400, JSON.stringify({ error: 'Les coordonnées ne correspondent pas au lieu.' }));
        }
        return send(200, JSON.stringify(publicWeatherFiles(profile, entry, releaseNumber)[resource + '.json']));
      }
      if (!siteRoot || !url.pathname.startsWith(sitePath)) return send(404, '{}');
      const resource = decodeURIComponent(url.pathname.slice(sitePath.length));
      if (resource.split(/[\\/]/).some(part => part.startsWith('.'))) return send(404, '{}');
      const candidate = path.resolve(siteRoot, resource || 'index.html');
      if (!within(siteRoot, candidate)) return send(404, '{}');
      const filename = await realpath(candidate);
      const type = types[path.extname(filename).toLowerCase()];
      if (!within(siteRoot, filename) || !type || !(await stat(filename)).isFile()) return send(404, '{}');
      return send(200, await readFile(filename), type);
    } catch (error) {
      return send(error.code === 'ENOENT' || error instanceof URIError ? 404 : 500, JSON.stringify({ error: 'Ressource indisponible.' }));
    }
  });
  return { server, refresh };
}

async function main() {
  const arg = (name, fallback) => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3) ?? fallback;
  const configFile = arg('config');
  if (!configFile) throw new Error('Indiquer --config=chemin/vers/site.private.conf.');
  const configPath = await realpath(configFile);
  const config = parsePrivateConfig(await readFile(configPath, 'utf8'));
  const siteDirectory = arg('site');
  if (siteDirectory && within(await realpath(siteDirectory), configPath)) throw new Error('La configuration privée doit rester hors du dossier public.');
  const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  const releaseNumber = [...changelog.matchAll(/— v(\d+\.\d{3}) —/g)].at(-1)?.[1] || '';
  const { server, refresh } = await createWeatherServer({ config,
    stateFile: arg('state', '.cache/weather/server.json'), siteDirectory, releaseNumber,
    onErrors: errors => console.error(JSON.stringify(errors)) });
  const port = Number(arg('port', '8080'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port invalide.');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, arg('host', '127.0.0.1'), resolve); });
  console.log('Serveur météo démarré sur le port ' + port + (siteDirectory ? ' avec hébergement du site.' : ' (API uniquement).'));
  const tick = () => {
    for (const group of ['piaf', 'forecast']) void refresh(group).catch(() => console.error('Collecte ' + group + ' interrompue ; acquisitions précédentes conservées.'));
  };
  void tick();
  // sourceDue keeps each weather source at its existing frequency; no concurrent collection.
  const timer = setInterval(tick, 60000);
  const stop = () => {
    clearInterval(timer);
    server.close();
    // Let an ongoing collection checkpoint safely before exiting.
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('Démarrage impossible : vérifier la configuration, le cache et le port du serveur.'); process.exitCode = 1; });
}
