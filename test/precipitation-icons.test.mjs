import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { weatherPictogram } from '../public/daily-rows.js';

const sample = { time: '2026-11-04T12:00:00Z', cloudCover: 100 };
const cloud = value => `<span data-cloud-rain="${value.rainLevel}"></span>`;

test('les cinq calques de pluie ont réellement un à cinq traits', async () => {
  for (let level = 1; level <= 5; level++) {
    const svg = await readFile(new URL('../public/vendor/weather-variants/rain-' + level + '.svg', import.meta.url), 'utf8');
    assert.equal((svg.match(/<path /g) || []).length, level);
  }
});

test('la neige adapte le nombre de flocons aux cm, indépendamment de l’équivalent eau', async () => {
  for (const [snowfall, level] of [[.1, 1], [.4, 2], [2, 3]]) {
    const html = weatherPictogram({ ...sample, rain: 100, liquidRain: 0, snowfall }, cloud);
    assert.ok(html.includes('calque-neige-' + level + '.svg'));
    assert.ok(html.includes('data-cloud-rain="0"'));
    const svg = await readFile(new URL('../public/pictogrammes/calque-neige-' + level + '.svg', import.meta.url), 'utf8');
    assert.equal((svg.match(/data-part="snowflake"/g) || []).length, level);
  }
});

test('en mélange, les niveaux pluie et neige varient séparément et le nuage ne rajoute pas de pluie', () => {
  for (const [liquidRain, rainLevel] of [[.2, 1], [6, 2], [12, 3], [18, 4], [35, 5]]) {
    for (const [snowfall, snowLevel] of [[.1, 1], [.4, 2], [2, 3]]) {
      const html = weatherPictogram({ ...sample, rain: liquidRain + 10, liquidRain, snowfall }, cloud);
      assert.ok(html.includes('day-mixed-layer'));
      assert.ok(html.includes('href="vendor/weather-variants/rain-' + rainLevel + '.svg"'));
      assert.ok(html.includes('href="pictogrammes/calque-neige-' + snowLevel + '.svg"'));
      assert.ok(html.includes('data-cloud-rain="0"'));
      assert.ok(html.includes('simultanéité non précisée'));
    }
  }
});

test('le sec et les quantités inconnues ne gagnent aucun trait, sans convertir le froid en neige', () => {
  const dry = weatherPictogram({ ...sample, rain: 0, snowfall: 0 }, cloud);
  assert.ok(dry.includes('data-cloud-rain="0"'));
  assert.ok(!dry.includes('calque-neige-'));
  const unknown = weatherPictogram({ ...sample, rain: null, liquidRain: null, snowfall: null, temperature: -5 }, cloud);
  assert.ok(unknown.includes('data-cloud-rain="0"'));
  assert.ok(!unknown.includes('calque-neige-'));
});
