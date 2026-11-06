import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = (...args) => execFileSync(process.execPath, ['scripts/build.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('la base se construit seule avec ses ressources locales, sans données ni modules optionnels actifs', async () => {
  build();
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(html.includes('Bulletin météo local'));
  assert.ok(html.includes('Lieu à définir'));
  assert.ok(!html.includes('__SITE_'));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(html.includes("connect-src 'self';"));
  const context = { window: {} };
  runInNewContext(await readFile(path.join(root, 'dist/runtime-config.js'), 'utf8'), context);
  const config = context.window.METEO_RUNTIME_CONFIG;
  const journal = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.equal(config.releaseNumber, [...journal.matchAll(/— v(\d+\.\d{3}) —/g)].at(-1)[1]);
  assert.equal(config.dataMode, 'static');
  assert.equal(config.apiBase, './');
  for (const feature of ['nowcasting', 'radar', 'pam', 'lightning', 'temperatureNormals']) {
    assert.equal(config.site.features[feature], false);
  }
  const dashboard = JSON.parse(await readFile(path.join(root, 'dist/data/dashboard.json'), 'utf8'));
  assert.equal(dashboard.status, 'loading');
  assert.equal(dashboard.data.latitude, null);
  assert.equal(dashboard.data.longitude, null);
  assert.equal(dashboard.data.arome, null);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('#')) await access(path.join(root, 'dist', match[1].split('?')[0]));
  }
  const worker = await readFile(path.join(root, 'dist/service-worker.js'), 'utf8');
  const shell = JSON.parse(worker.match(/const shell = (\[[^\n]+?\])\.map/)[1]);
  for (const file of shell) await access(path.join(root, 'dist', file.split('?')[0]));
  for (const name of ['calque-pluie-1.svg', 'calque-vent.svg', 'calque-orage.svg']) {
    await access(path.join(root, 'dist/pictogrammes', name));
  }
});

test('un état provenant d’un autre lieu est refusé avant de remplacer la construction', async () => {
  const directory = path.join(root, '.cache');
  await mkdir(directory, { recursive: true });
  const state = path.join(directory, 'wrong-location.json');
  await writeFile(state, JSON.stringify({ siteId: 'autre-lieu', latitude: 0, longitude: 0 }));
  assert.throws(() => build('--state=' + state), /Les données ne correspondent pas/);
});

test('une collecte sans coordonnées est refusée avant tout accès réseau', async () => {
  const { collectWeather } = await import('../scripts/collect-weather.mjs');
  const { siteProfile } = await import('../sites/profiles.mjs');
  await assert.rejects(collectWeather({ profile: siteProfile() }), /coordonnées du lieu/);
});

test('une installation extérieure construit son bulletin sans recopier le moteur ni exposer ses paramètres privés', async () => {
  const { prepareInheritedSite } = await import('../scripts/prepare-inherited-site.mjs');
  const workspace = path.join(root, '.cache', 'consumer');
  await mkdir(workspace, { recursive: true });
  const profile = {
    id: 'exemple', name: 'Météo & environs>Exemple <local>', place: 'Exemple',
    latitude: 48.8566, longitude: 2.3522, headerAltitude: 35, department: '75', timezone: 'Europe/Paris'
  };
  await writeFile(path.join(workspace, 'site.json'), JSON.stringify(profile));
  const state = { siteId: profile.id, latitude: profile.latitude, longitude: profile.longitude,
    arome: { fetchedAt: Date.now(), hours: [{ time: new Date().toISOString(), temperature: 15 }] } };
  await writeFile(path.join(workspace, 'state.json'), JSON.stringify(state));
  const result = await prepareInheritedSite({ workspace, profilePath: 'site.json', statePath: 'state.json' });
  const html = await readFile(path.join(result.siteDirectory, 'index.html'), 'utf8');
  assert.ok(html.includes('<title>Météo &amp; environs&gt;Exemple &lt;local&gt;</title>'));
  assert.ok(html.includes('<h1>Météo &amp; environs&gt;Exemple &lt;local&gt;</h1>'));
  assert.ok(!html.includes('__SITE_'));
  assert.ok(!html.includes('Lieu à définir'));
  assert.ok(html.includes('48,8566° N'));
  const data = JSON.parse(await readFile(path.join(result.siteDirectory, 'data/dashboard.json'), 'utf8')).data;
  assert.equal(data.arome.hours[0].temperature, 15);
  assert.equal(data.latitude, profile.latitude);
  const manifest = JSON.parse(await readFile(path.join(result.siteDirectory, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, profile.name);
  await assert.rejects(prepareInheritedSite({ workspace, profilePath: 'site.json', statePath: '../outside.json' }), /cache doit rester/);
});

test('la reconstruction fusionne les collectes concurrentes et garde chaque source la plus récente', async () => {
  const { prepareInheritedSite } = await import('../scripts/prepare-inherited-site.mjs');
  const workspace = path.join(root, '.cache', 'consumer-merge');
  await mkdir(path.join(workspace, 'updates', 'forecast'), { recursive: true });
  await rm(path.join(workspace, 'updates', 'foreign.json'), { force: true });
  const profile = { id: 'exemple', name: 'Bulletin', place: 'Exemple', latitude: 48.8566, longitude: 2.3522, department: '75', timezone: 'Europe/Paris' };
  await writeFile(path.join(workspace, 'site.json'), JSON.stringify(profile));
  const base = { siteId: profile.id, latitude: profile.latitude, longitude: profile.longitude };
  const piaf = time => ({ fetchedAt: time, runTime: new Date(time).toISOString(), values: [{ seconds: 300, precipitation: .1 }] });
  const arome = time => ({ fetchedAt: time, runTime: new Date(time).toISOString(), hours: [{ time: new Date().toISOString(), temperature: 15 }] });
  await writeFile(path.join(workspace, 'state.json'), JSON.stringify({ ...base, piaf: piaf(300), arome: arome(100) }));
  await writeFile(path.join(workspace, 'updates', 'forecast', 'forecast.json'), JSON.stringify({ ...base, piaf: piaf(200), arome: arome(400) }));
  await prepareInheritedSite({ workspace, profilePath: 'site.json', statePath: 'state.json', updates: ['updates', 'absent'] });
  const state = JSON.parse(await readFile(path.join(workspace, 'state.json'), 'utf8'));
  assert.equal(state.piaf.fetchedAt, 300);
  assert.equal(state.arome.fetchedAt, 400);
  await writeFile(path.join(workspace, 'updates', 'foreign.json'), JSON.stringify({ ...base, siteId: 'autre' }));
  await assert.rejects(prepareInheritedSite({ workspace, profilePath: 'site.json', statePath: 'state.json', updates: 'updates' }), /autre lieu/);
  await assert.rejects(prepareInheritedSite({ workspace, profilePath: 'site.json', statePath: 'state.json', updates: ['../outside'] }), /dossier de travail/);
});

test('a private configuration can build the bulletin without including either credential in runtime files', async () => {
  const { preparePrivateConfig } = await import('../scripts/private-config.mjs');
  const { profilePath } = await preparePrivateConfig({
    workspace: root,
    text: JSON.stringify({
      site: { name:'Bulletin',latitude:48.8566,longitude:2.3522,
        department:'75',timezone:'Europe/Paris',githubRepository:'example/weather' },
      githubToken:'github-private-build-fixture',meteoFranceToken:'meteo-private-build-fixture'
    })
  });
  build('--profile=' + profilePath);
  for (const file of ['runtime-config.js','index.html','manifest.webmanifest','data/dashboard.json','data/week.json']) {
    const text = await readFile(path.join(root,'dist',file),'utf8');
    assert.equal(text.includes('github-private-build-fixture'),false);
    assert.equal(text.includes('meteo-private-build-fixture'),false);
  }
  const configText = await readFile(path.join(root,'dist/runtime-config.js'),'utf8');
  assert.ok(configText.includes('example/weather'));
});

test('une installation serveur se construit sans GitHub et le site externe peut lire les JSON GitHub', async () => {
  const configuration = path.join(root, '.cache', 'standalone.private.conf');
  await mkdir(path.dirname(configuration), { recursive: true });
  const site = { name: 'Bulletin autonome', latitude: 48.8566, longitude: 2.3522,
    publicUrl: 'https://weather.example/', apiMode: 'server', apiBaseUrl: 'https://api.example/weather/' };
  await writeFile(configuration, JSON.stringify({ site, meteoFranceToken: 'private-server-test-token' }));
  build('--config=' + configuration);
  const context = { window: {} };
  const text = await readFile(path.join(root, 'dist/runtime-config.js'), 'utf8');
  assert.equal(text.includes('private-server-test-token'), false);
  runInNewContext(text, context);
  assert.equal(context.window.METEO_RUNTIME_CONFIG.dataMode, 'server');
  assert.equal(context.window.METEO_RUNTIME_CONFIG.apiBase, site.apiBaseUrl);
  assert.equal(context.window.METEO_RUNTIME_CONFIG.management.repository, '');
  const serverHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(serverHtml.includes("connect-src 'self' https://api.example;"));
  assert.equal(serverHtml.includes('__CONNECT_SOURCES__'), false);
  assert.equal(/connect-src[^;]*\*/.test(serverHtml), false);

  site.apiMode = 'github-actions';
  site.githubRepository = 'example/example.github.io';
  site.apiBaseUrl = 'https://example.github.io/';
  await writeFile(configuration, JSON.stringify({ site, meteoFranceToken: '' }));
  build('--config=' + configuration);
  runInNewContext(await readFile(path.join(root, 'dist/runtime-config.js'), 'utf8'), context);
  assert.equal(context.window.METEO_RUNTIME_CONFIG.dataMode, 'static');
  assert.equal(context.window.METEO_RUNTIME_CONFIG.apiBase, site.apiBaseUrl);
  const externalHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(externalHtml.includes("connect-src 'self' https://example.github.io;"));
  // Exercise the actual browser URL resolver for default, remote JSON and live API configurations.
  const script = (await readFile(path.join(root, 'public/app.js'), 'utf8')).split('let basicForecastTools = null;')[0];
  for (const [runtime, expected] of [
    [{ dataMode: 'static' }, 'https://weather.example/data/dashboard.json'],
    [context.window.METEO_RUNTIME_CONFIG, 'https://example.github.io/data/dashboard.json'],
    [{ dataMode: 'server', apiBase: 'https://api.example/weather/' }, 'https://api.example/weather/api/dashboard?lat=48.8566']
  ]) {
    const browser = { URL, Map, window: { METEO_RUNTIME_CONFIG: runtime }, document: { baseURI: 'https://weather.example/' } };
    // Keep module loading out of this URL-resolution test.
    browser.window.METEO_RUNTIME_CONFIG = { ...runtime, site: {} };
    runInNewContext(script + '\nresult = String(apiUrl("api/dashboard?lat=48.8566"));', browser);
    assert.equal(browser.result, expected);
  }
});
