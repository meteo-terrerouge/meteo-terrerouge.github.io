import test from 'node:test';
import assert from 'node:assert/strict';
import { piafChartMarkup, precipitationCoverageSuffix } from '../public/daily-rows.js';

test('PIAF incomplet affiche son heure réelle, avec minutes, y compris pour le sec', () => {
  const now = Date.parse('2026-11-04T17:00:00Z');
  for (const precipitation of [0, .03, .1]) {
    const rainSteps = [{ intervalStart: now, intervalEnd: now + 45 * 60000, precipitation }];
    const html = piafChartMarkup({ rainSteps }, { now, compact: true });
    assert.ok(html.includes('(jusqu’à 18 h 45)'));
    assert.ok(!html.includes('(partiel)'));
    if (precipitation === .03) {
      assert.ok(html.includes('<b>gouttes (jusqu’à 18 h 45)</b>'));
      assert.ok(!html.includes('gouttes mm'));
    }
    if (precipitation === .1) assert.ok(html.includes('<b>0,1 mm (jusqu’à 18 h 45)</b>'));
  }
});

test('une couverture complète ou absente ne reçoit aucune fausse limite horaire', () => {
  const now = Date.parse('2026-11-04T17:00:00Z');
  const full = piafChartMarkup({ rainSteps: [{ intervalStart: now, intervalEnd: now + 3 * 3600000, precipitation: 0 }] }, { now, compact: true });
  const missing = piafChartMarkup(null, { now, compact: true });
  assert.ok(!full.includes('jusqu’à'));
  assert.ok(!missing.includes('jusqu’à'));
  assert.ok(!missing.includes('Pas de pluie'));
  assert.equal(precipitationCoverageSuffix([]), '');
});

test('la frise compacte laisse le fond de sa carte visible en mode sombre', () => {
  const html = piafChartMarkup(null, { compact: true });
  assert.ok(!html.includes('fill="#fff"'));
  assert.ok(html.includes('piaf-timeline-canvas'));
});

test('PIAF humide et modèle sec avec composantes connues : pluie estimée sans seuil de température', () => {
  const now = Date.parse('2026-11-04T17:00:00Z'), hour = 3600000;
  for (const temperature of [-5, 8]) {
    const dashboard = { arome: { hours: [{ time: new Date(now + hour).toISOString(),
      rain: 0, liquidRain: 0, snowfall: 0, cloudCover: 90, temperature }] } };
    const forecast = { rainSteps: [{ intervalStart: now, intervalEnd: now + hour, precipitation: .6 }] };
    const before = structuredClone({ dashboard, forecast });
    const html = piafChartMarkup(forecast, { now, compact: true, dashboard });
    assert.ok(html.includes('piaf-rain-bar piaf-phase-rain'));
    assert.ok(html.includes('phase estimée par AROME'));
    assert.ok(html.includes('PIAF positif ; pluie estimée'));
    assert.ok(!html.includes('Nature indéterminée'));
    assert.ok(!html.includes('piaf-snow-bar'));
    assert.deepEqual({ dashboard, forecast }, before);
  }
});

test('une vraie absence de nature reste inconnue, et un code verglaçant reste prioritaire', () => {
  const now = Date.parse('2026-11-04T17:00:00Z'), hour = 3600000;
  const forecast = { rainSteps: [{ intervalStart: now, intervalEnd: now + hour, precipitation: 1 }] };
  const base = { time: new Date(now + hour).toISOString(), rain: 0, liquidRain: null, snowfall: null, temperature: 12, cloudCover: 90 };
  const missing = piafChartMarkup(forecast, { now, compact: true, dashboard: { arome: { hours: [base] } } });
  assert.ok(missing.includes('Nature indéterminée (données de phase absentes)'));
  assert.ok(!missing.includes('piaf-snow-bar'));
  const freezing = piafChartMarkup(forecast, { now, compact: true, dashboard: { arome: { hours: [{ ...base, rain: 1, liquidRain: 1, snowfall: 0, weatherCode: 66 }] } } });
  assert.ok(freezing.includes('piaf-rain-bar piaf-phase-freezing'));
});
