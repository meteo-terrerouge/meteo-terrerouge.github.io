import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parsePrivateConfig, preparePrivateConfig } from '../scripts/private-config.mjs';
import { adminTokenFromConfig } from '../public/admin-api.js';

const value = () => ({
  site: { name:'Bulletin',latitude:48.8566,longitude:2.3522,
    department:'75',timezone:'Europe/Paris',githubRepository:'example/weather' },
  githubToken:'github-private-fixture',meteoFranceToken:'meteo-private-fixture'
});
test('private config exports only the public profile; masks credentials and scopes the repository', async () => {
  const workspace=await mkdtemp(path.join(os.tmpdir(),'bulletin-config-'));
  try {
    const config=value(), masked=[];
    const result=await preparePrivateConfig({ text:JSON.stringify(config),workspace,
      expectedRepository:'example/weather',outputFile:path.join(workspace,'outputs'),
      envFile:path.join(workspace,'environment'),mask:token=>masked.push(token) });
    const profileText=await readFile(result.profilePath,'utf8');
    assert.equal(profileText.includes(config.githubToken),false);
    assert.equal(profileText.includes(config.meteoFranceToken),false);
    assert.equal(JSON.parse(profileText).latitude,48.8566);
    assert.deepEqual(masked,[config.githubToken,config.meteoFranceToken]);
    assert.equal(await readFile(path.join(workspace,'environment'),'utf8'),'METEO_FRANCE_API_KEY='+config.meteoFranceToken+'\n');
    await assert.rejects(preparePrivateConfig({text:JSON.stringify(config),workspace,expectedRepository:'other/site'}),/autre dépôt/);
  } finally { await rm(workspace,{recursive:true,force:true}); }
});
test('invalid JSON and injected environment lines never expose credentials in errors', () => {
  assert.throws(()=>parsePrivateConfig('{"githubToken":"private-value"'),error=>!error.message.includes('private-value'));
  const config=value(); config.meteoFranceToken='private\nINJECTED=value';
  assert.throws(()=>parsePrivateConfig(JSON.stringify(config)),error=>!error.message.includes('private\n'));
});
test('admin reads only the GitHub authorization from the matching private file', () => {
  const config=value();
  assert.equal(adminTokenFromConfig(JSON.stringify(config),'example/weather'),config.githubToken);
  assert.throws(()=>adminTokenFromConfig(JSON.stringify(config),'other/weather'),/autre site/);
  config.githubToken='';
  assert.throws(()=>adminTokenFromConfig(JSON.stringify(config),'example/weather'),/githubToken/);
});

test('comments remain private metadata and a single name configures the title', () => {
  const config=value();
  config._comments={'site.department':'Vigilance','site.headerAltitude':'Altitude affichée'};
  const parsed=parsePrivateConfig(JSON.stringify(config));
  assert.equal(parsed.site.name,'Bulletin');
  assert.equal(parsed._comments,undefined);
  assert.equal(parsed.site.id,undefined);
  assert.equal(parsed.site.place,undefined);
  config.site.headingPrefix='Unused';
  assert.throws(()=>parsePrivateConfig(JSON.stringify(config)),/headingPrefix/);
});

test('hash comments work in Actions and admin without changing quoted hashes or escaped quotes', async () => {
  const config=value();
  config.site.name='Titre "complet" # local';
  config.githubToken='github#fixture';
  const text='# Configuration privée\n'+JSON.stringify(config,null,2).replace('"department":', '# Vigilance\n"department":')+' # fin\n';
  assert.equal(parsePrivateConfig(text).site.name,config.site.name);
  assert.equal(adminTokenFromConfig(text,'example/weather'),config.githubToken);
});

test('la configuration serveur permet de se passer de compte GitHub sans contourner le contrôle du dépôt en Actions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bulletin-server-config-'));
  try {
    const config = value();
    config.site.apiMode = 'server';
    config.site.apiBaseUrl = 'https://api.example/';
    delete config.site.githubRepository;
    delete config.githubToken;
    assert.equal(parsePrivateConfig(JSON.stringify(config)).githubToken, '');
    await assert.rejects(preparePrivateConfig({ text: JSON.stringify(config), workspace, expectedRepository: 'example/weather' }), /autre dépôt/);
    config.site.githubRepository = 'example/weather';
    const outputFile = path.join(workspace, 'outputs');
    await preparePrivateConfig({ text: JSON.stringify(config), workspace, expectedRepository: 'example/weather', outputFile });
    assert.match(await readFile(outputFile, 'utf8'), /api-mode=server\n/);
    config.site.apiMode = 'github-actions';
    delete config.site.githubRepository;
    assert.throws(() => parsePrivateConfig(JSON.stringify(config)), /githubRepository/);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
