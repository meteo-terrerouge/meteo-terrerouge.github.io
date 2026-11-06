import test from 'node:test';
import assert from 'node:assert/strict';
import { piafChartMarkup } from '../public/daily-rows.js';

const now = Date.parse('2026-11-06T12:00:00Z');
const hour = 3600000;
const dashboard = extra => ({ arome: { hours: [{ time: new Date(now + hour).toISOString(), rain: 2, liquidRain: 2, snowfall: 0, ...extra }] } });
const forecast = amounts => ({ rainSteps: amounts.map((precipitation, index) => ({ intervalStart: now + index * 300000, intervalEnd: now + (index + 1) * 300000, precipitation })) });
const tips = html => [...html.matchAll(/data-tooltip="([^"]*)"/g)].map(match => match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&'));

test('le survol de la frise ne contient que cumul PIAF, intensité et flèche de tendance', () => {
  const html = piafChartMarkup(forecast([.05, .1, .08]), { now, compact: true, dashboard: dashboard() });
  const details = tips(html);
  assert.ok(details.length > 3);
  for (const detail of details) {
    const lines = detail.split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^Cumul PIAF : /);
    assert.match(lines[1], /^Intensité : /);
    assert.match(lines[2], /^Tendance : [↗→↘—]$/);
    assert.doesNotMatch(detail, /AROME|estimée|phase|échelle|équivalent|créneau|12:|13:/);
  }
  assert.match(details[0], /Cumul PIAF : 0,05 mm\nIntensité : Pluie faible · 0,6 mm\/h\nTendance : ↗$/);
  assert.match(details[1], /Tendance : ↘$/);
  assert.match(details[2], /Tendance : ↘$/);
  assert.doesNotMatch(html, /title="[^\"]*(?:phase|phénomènes|équivalent|cm\/h|mm\/h)/);
});

test('l’intensité neige utilise les cm acquis, sans convertir le cumul PIAF', () => {
  const html = piafChartMarkup(forecast([.5, .5]), { now, compact: true, dashboard: dashboard({ rain: 7, liquidRain: 0, snowfall: 2, weatherCode: 73 }) });
  const details = tips(html);
  const point = details.find(detail => detail.startsWith('Cumul PIAF : 0,5 mm'));
  assert.ok(point);
  assert.match(point, /Intensité : Neige forte · 2 cm\/h/);
  assert.match(point, /Tendance : →$/);
  assert.ok(details.every(detail => !detail.includes('PIAF : 2 cm')));
});

test('mélange, verglaçant, phase inconnue, sec et données absentes restent distincts', () => {
  const render = (amounts, extra) => tips(piafChartMarkup(forecast(amounts), { now, compact: true, dashboard: dashboard(extra) }));
  assert.ok(render([.1, .1], { rain: 2, liquidRain: 1, snowfall: .5 })[0].includes('Pluie et neige · 1 mm/h + 0,5 cm/h'));
  assert.ok(render([.1, .1], { rain: 2, liquidRain: 2, snowfall: 0, weatherCode: 66 })[0].includes('Pluie verglaçante faible'));
  assert.ok(render([.1, .1], { liquidRain: null, snowfall: null })[0].includes('Nature inconnue'));
  assert.match(render([0, 0], { rain: 0, liquidRain: 0, snowfall: 0 })[0], /Cumul PIAF : 0 mm\nIntensité : Nulle · 0 mm\/h\nTendance : →$/);
  const missing = tips(piafChartMarkup(null, { now, compact: true }));
  assert.ok(missing.length);
  assert.ok(missing.every(detail => detail === 'Cumul PIAF : —\nIntensité : —\nTendance : —'));
});
