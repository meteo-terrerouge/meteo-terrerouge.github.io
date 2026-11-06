import { parseConfigText } from '../public/config-format.js';
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeSiteProfile } from '../sites/profiles.mjs';

export function parsePrivateConfig(text) {
  let value;
  try { value = parseConfigText(text); } catch { throw new Error('Fichier privé invalide.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['site', 'githubToken', 'meteoFranceToken', '_comments'].includes(key))) {
    throw new Error('Configuration privée invalide : site, githubToken et meteoFranceToken attendus.');
  }
  const normalized = normalizeSiteProfile(value.site);
  const keys = ['name', 'latitude', 'longitude', 'department', 'headerAltitude', 'timezone', 'publicUrl', 'githubRepository', 'githubBranch', 'apiMode', 'apiBaseUrl'];
  for (const key of Object.keys(value.site)) if (!keys.includes(key)) throw new Error('Paramètre de configuration inconnu : ' + key);
  const site = Object.fromEntries(Object.keys(value.site).map(key => [key, normalized[key]]));
  if (normalized.apiMode === 'github-actions' && !site.githubRepository) throw new Error('site.githubRepository est requis pour GitHub Actions.');
  if (value.githubToken === undefined) value.githubToken = '';
  for (const key of ['githubToken', 'meteoFranceToken']) {
    if (typeof value[key] !== 'string' || /[\r\n]/.test(value[key])) throw new Error('Jeton privé invalide : ' + key);
  }
  return { site, githubToken: value.githubToken.trim(), meteoFranceToken: value.meteoFranceToken.trim() };
}

export async function preparePrivateConfig({ text, filename, workspace = process.cwd(), expectedRepository,
  outputFile, envFile, exportGithubToken = false, mask = () => {} }) {
  const config = parsePrivateConfig(filename ? await readFile(filename, 'utf8') : text);
  if (expectedRepository && config.site.githubRepository?.toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error('La configuration privée appartient à un autre dépôt.');
  }
  for (const token of [config.githubToken, config.meteoFranceToken]) if (token) mask(token);
  const directory = path.resolve(workspace, '.cache/site-config');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const profilePath = path.join(directory, 'site.json');
  // Only the allowlisted public profile is written; credentials remain in memory / Actions secrets.
  await writeFile(profilePath, JSON.stringify(config.site, null, 2) + '\n', { mode: 0o600 });
  if (outputFile) await appendFile(outputFile, 'profile=' + profilePath + '\napi-mode=' + (config.site.apiMode || 'github-actions') + '\n' + (exportGithubToken ? 'github-token=' + config.githubToken + '\n' : ''));
  if (envFile) await appendFile(envFile, 'METEO_FRANCE_API_KEY=' + config.meteoFranceToken + '\n');
  return { profilePath, config };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const filename = process.argv.find(value => value.startsWith('--file='))?.slice(7);
    const mask = value => console.log('::add-mask::' + value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
    await preparePrivateConfig({
      filename, text: process.env.BULLETIN_CONFIG,
      expectedRepository: process.env.GITHUB_REPOSITORY,
      outputFile: process.env.GITHUB_OUTPUT, exportGithubToken: process.env.BULLETIN_EXPORT_GITHUB_TOKEN === 'true', envFile: process.env.GITHUB_ENV, mask: process.env.GITHUB_ACTIONS === 'true' ? mask : () => {}
    });
    console.log('Configuration du lieu préparée ; jetons exclus des fichiers publics.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
