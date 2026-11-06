import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWeatherServer } from '../scripts/server.mjs';
import { parsePrivateConfig } from '../scripts/private-config.mjs';

const configuration = () => parsePrivateConfig(JSON.stringify({ site: {
  name: 'Bulletin serveur', latitude: 48.8566, longitude: 2.3522,
  publicUrl: 'https://weather.example/bulletin/', apiMode: 'server', apiBaseUrl: 'https://api.example/meteo/'
}, meteoFranceToken: 'private-test-token' }));

test('le serveur collecte une seule fois, persiste les réussites et sert le site et les API sans secret', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bulletin-server-'));
  let server;
  try {
    const siteDirectory = path.join(directory, 'public');
    await mkdir(siteDirectory);
    await writeFile(path.join(siteDirectory, 'index.html'), '<h1>Bulletin</h1>');
    await writeFile(path.join(siteDirectory, 'private.conf'), 'secret-in-static-directory');
    const config = configuration();
    const stateFile = path.join(directory, 'private', 'state.json');
    let calls = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const errors = [];
    const running = await createWeatherServer({ config, stateFile, siteDirectory, releaseNumber: 'test',
      onErrors: value => errors.push(value),
      collectImpl: async ({ profile, token, checkpoint }) => {
        calls++;
        assert.equal(token, config.meteoFranceToken);
        await gate;
        const entry = { siteId: profile.id, latitude: profile.latitude, longitude: profile.longitude,
          piaf: { fetchedAt: 1000, values: [{ precipitation: 0.1 }] } };
        await checkpoint(entry);
        return { entry, errors: [{ source: 'arome', message: token }] };
      } });
    server = running.server;
    const first = running.refresh('piaf'), second = running.refresh('piaf');
    assert.equal(first, second);
    release();
    await first;
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(errors).includes(config.meteoFranceToken), false);
    assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).piaf.fetchedAt, 1000);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(base + '/meteo/api/dashboard?lat=48.8566&lon=2.3522', { headers: { Origin: 'https://weather.example' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://weather.example');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.equal(JSON.parse(body).data.piaf.fetchedAt, 1000);
    assert.equal(body.includes(config.meteoFranceToken), false);
    assert.equal((await fetch(base + '/meteo/api/dashboard?lat=0')).status, 400);
    const otherOrigin = await fetch(base + '/meteo/api/config', { headers: { Origin: 'https://other.example' } });
    assert.equal(otherOrigin.headers.get('access-control-allow-origin'), null);
    assert.equal((await otherOrigin.json()).releaseNumber, 'test');
    assert.equal((await fetch(base + '/meteo/api/week')).status, 200);
    assert.equal((await fetch(base + '/meteo/api/dashboard', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/meteo/api/unknown')).status, 404);
    assert.equal(await (await fetch(base + '/bulletin/')).text(), '<h1>Bulletin</h1>');
    assert.equal((await fetch(base + '/bulletin/private.conf')).status, 404);
    assert.equal((await fetch(base + '/bulletin/%2eprivate/state.json')).status, 404);
    assert.equal((await fetch(base + '/elsewhere/')).status, 404);
    assert.equal(await (await fetch(base + '/bulletin/', { method: 'HEAD' })).text(), '');

    const restarted = await createWeatherServer({ config, stateFile });
    await new Promise(resolve => restarted.server.listen(0, '127.0.0.1', resolve));
    try {
      const restored = await fetch('http://127.0.0.1:' + restarted.server.address().port + '/meteo/api/dashboard').then(r => r.json());
      assert.equal(restored.data.piaf.fetchedAt, 1000);
    } finally { await new Promise(resolve => restarted.server.close(resolve)); }
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('un échec de collecte conserve le cache et ne bloque pas la collecte suivante', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bulletin-failure-'));
  try {
    const config = configuration();
    let attempt = 0;
    const stateFile = path.join(directory, 'state.json');
    const running = await createWeatherServer({ config, stateFile, collectImpl: async ({ profile }) => {
      if (++attempt === 1) throw new Error('panne');
      return { entry: { siteId: profile.id, latitude: profile.latitude, longitude: profile.longitude }, errors: [] };
    } });
    await assert.rejects(running.refresh('forecast'), /panne/);
    await running.refresh('forecast');
    assert.equal(attempt, 2);
    const siteDirectory = path.join(directory, 'public');
    await mkdir(siteDirectory);
    await assert.rejects(createWeatherServer({ config, stateFile: path.join(siteDirectory, 'state.json'), siteDirectory }), /hors du dossier public/);
    await writeFile(stateFile, JSON.stringify({ siteId: 'autre', latitude: 0, longitude: 0 }));
    await assert.rejects(createWeatherServer({ config, stateFile }), /autre lieu/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('une collecte lente de modèles ne bloque pas PIAF et ne republie pas son ancien état', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bulletin-lanes-'));
  try {
    const config = configuration();
    const stateFile = path.join(directory, 'state.json');
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const running = await createWeatherServer({ config, stateFile, collectImpl: async ({ profile, entry, group }) => {
      entry = { ...entry, siteId: profile.id, latitude: profile.latitude, longitude: profile.longitude };
      if (group === 'forecast') {
        await wait;
        entry.arome = { fetchedAt: 400, runTime: '2026-11-06T06:00:00Z' };
      } else entry.piaf = { fetchedAt: 300, runTime: '2026-11-06T10:00:00Z' };
      return { entry, errors: [] };
    } });
    const forecast = running.refresh('forecast');
    await running.refresh('piaf');
    assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).piaf.fetchedAt, 300);
    release();
    await forecast;
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    assert.equal(saved.piaf.fetchedAt, 300);
    assert.equal(saved.arome.fetchedAt, 400);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
