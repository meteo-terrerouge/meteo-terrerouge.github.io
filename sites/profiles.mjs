import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const base = {
  id: 'local', name: 'Bulletin météo local', place: '',
  latitude: null, longitude: null, department: null, timezone: 'Europe/Paris',
  forecastLayout: 'daily-rows', forecastDays: 16, dailyPresentation: 'period-cards',
  headerAltitude: null,
  apiMode: 'github-actions',
  features: {
    piaf: true, arome: true, arpege: true, pearome: false, vigilance: true,
    nowcasting: false, radar: false, pam: false, lightning: false,
    openMeteo: true, temperatureNormals: false
  }
};

export function siteProfile(id = base.id) {
  if (id !== base.id) throw new Error('Site inconnu : ' + id);
  return structuredClone(base);
}

export function normalizeSiteProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Profil de lieu invalide.');
  const profile = siteProfile();
  const keys = ['id', 'name', 'place', 'latitude', 'longitude', 'department', 'timezone', 'headerAltitude', 'publicUrl', 'githubRepository', 'githubBranch', 'meteoTokenSecret', 'apiMode', 'apiBaseUrl'];
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error('Paramètre de lieu inconnu : ' + key);
    profile[key] = value[key];
  }
  if (value.place === undefined) profile.place = profile.name;
  if (value.id === undefined) profile.id = 'site-' + createHash('sha256').update(JSON.stringify([profile.latitude, profile.longitude])).digest('hex').slice(0, 16);
  if (typeof profile.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(profile.id)) throw new Error('Identifiant de lieu invalide.');
  for (const key of ['name', 'place']) {
    if (typeof profile[key] !== 'string' || !profile[key].trim() || profile[key].length > 160 || /[\r\n]/.test(profile[key])) throw new Error('Libellé de lieu invalide : ' + key);
  }
  if (!Number.isFinite(profile.latitude) || Math.abs(profile.latitude) > 90 ||
      !Number.isFinite(profile.longitude) || Math.abs(profile.longitude) > 180) throw new Error('Coordonnées de lieu invalides.');
  if (profile.headerAltitude !== null && (!Number.isFinite(profile.headerAltitude) || profile.headerAltitude < -500 || profile.headerAltitude > 9000)) throw new Error('Altitude invalide.');
  if (profile.department !== null && (typeof profile.department !== 'string' || !/^(?:[0-9]{2,3}|2[AB])$/.test(profile.department))) throw new Error('Département invalide.');
  try { new Intl.DateTimeFormat('fr-FR', { timeZone: profile.timezone }); } catch { throw new Error('Fuseau horaire invalide.'); }
  if (profile.githubRepository !== undefined && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(profile.githubRepository)) throw new Error('Dépôt GitHub invalide.');
  if (profile.githubBranch !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(profile.githubBranch)) throw new Error('Branche GitHub invalide.');
  if (profile.meteoTokenSecret !== undefined && !/^[A-Z_][A-Z0-9_]*$/.test(profile.meteoTokenSecret)) throw new Error('Nom du secret météo invalide.');
  if (!['github-actions', 'server'].includes(profile.apiMode)) throw new Error('Mode de collecte API invalide.');
  if (profile.apiMode === 'server' && !profile.apiBaseUrl) throw new Error('Adresse du serveur API requise.');
  if (profile.apiBaseUrl !== undefined) {
    let url;
    try { url = new URL(profile.apiBaseUrl); } catch { throw new Error('Adresse du serveur API invalide.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Adresse de données HTTPS invalide.');
    profile.apiBaseUrl = url.href.endsWith('/') ? url.href : url.href + '/';
  }
  if (profile.publicUrl) {
    const url = new URL(profile.publicUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Adresse publique HTTPS invalide.');
    profile.publicUrl = url.href.endsWith('/') ? url.href : url.href + '/';
  }
  return profile;
}

export async function readSiteProfile(filename) {
  return filename ? normalizeSiteProfile(JSON.parse(await readFile(filename, 'utf8'))) : siteProfile();
}
