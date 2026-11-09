import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as dailyRowsTools from '../public/daily-rows.js';

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const fn = name => {
  const start = script.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = script.indexOf('\n}', start) + 2;
  return script.slice(start, end);
};
const constant = (name, multiline = false) => {
  const start = script.indexOf('const ' + name + ' =');
  assert.ok(start >= 0, name);
  const end = multiline ? script.indexOf('\n};', start) + 3 : script.indexOf('\n', start);
  return script.slice(start, end);
};
const local = name => {
  const start = script.indexOf('  const ' + name + ' =', script.indexOf('function renderTestingDailyForecast'));
  const end = script.indexOf('\n  };', start) + 5;
  return script.slice(start, end);
};
const functions = ['escapeText', 'backgroundTrendArrow', 'rainProbabilitySummary', 'weekRainBelowDisplayThreshold',
  'conciseRainSummary', 'cloudCoverBand', 'cloudCoverPresentation', 'conciseSkySummary', 'conciseWindSummary',
  'forecastPeriodSummaryText', 'forecastPeriodText', 'forecastSourceAlertTone', 'forecastSlotAlertTone', 'shortTermGustLabel', 'stormSignalPictogram',
  'weekWeightedValue', 'forecastPeriodAvailable', 'periodSourceDetails', 'forecastPeriodDetailsMarkup', 'forecastPeriodHighlights', 'dailyRowPeriodsMarkup', 'dailyRowDaySummaryMarkup'];
const code = [constant('rainPictogramStep'), constant('meanWindIntensityLevel', true), constant('gustIntensityLevel', true),
  constant('forecastPeriodOrder'), constant('cloudCoverLabels'), constant('periodMetricIcons', true),
  constant('periodMetricPictogram', true), constant('periodMetricRow'), ...functions.map(fn),
  local('periodCard')].join('\n');
const HOUR = 3600000, now = Date.parse('2026-10-24T00:00:00Z');
const slot = { key: 'morning', label: 'Matin', startHour: 2, endHour: 8, dayOffset: 0 };
function engine(dashboard = {}) {
  return runInNewContext(code + '\n({periodCard, dailyRowDaySummaryMarkup, dailyRowPeriodsMarkup, forecastPeriodDetailsMarkup, forecastPeriodHighlights, periodSourceDetails, forecastSlotAlertTone, rainProbabilitySummary})', {
    dailyRowsTools, siteProfile: { timezone: 'Europe/Paris' }, appNow: () => now, latestForecastData: dashboard, rainRiskDisplayThreshold: 20,
    forecastDailySlots: [slot], forecastSlotTimeRange: () => ({ start: now, end: now + 6 * HOUR }),
    slotDateKey: date => date, forecastLocalDateTime: () => new Date(now + 6 * HOUR),
    forecastSlotMidpointDate: () => new Date(now + 3 * HOUR), displayIcon: () => '<img alt="météo"/>',
    weekStormRisk: () => ({ level: 3 }), vigilanceSlotIcons: () => '',
    format: (value, digits = 1) => value != null ? value.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—'
  });
}
const panel = html => html.slice(html.indexOf('<div class="daily-period-details">'));

for (const scenario of [
  { name: 'sec et vent faible', rain: 0, probability: 0, cloudCover: 20, windSpeed: 10, windGust: 25, storm: false },
  { name: 'pluie probable et rafales', rain: 3, probability: 94, cloudCover: 100, windSpeed: 40, windGust: 65, storm: false },
  { name: 'averses', rain: 2, probability: 70, cloudCover: 90, windSpeed: 20, windGust: 35, storm: false, weatherCode: 81 },
  { name: 'orage violent', rain: 5, probability: 95, cloudCover: 100, windSpeed: 60, windGust: 85, storm: true, weatherCode: 96 },
  { name: 'orage et vent fort', rain: 6, probability: 95, cloudCover: 100, windSpeed: 60, windGust: 85, storm: true }
]) test('Carte et ligne quotidienne : détails identiques pour ' + scenario.name, () => {
  const hours = Array.from({ length: 25 }, (_, i) => ({ time: new Date(now + i * HOUR).toISOString(),
    temperature: 12, rain: scenario.rain, probability: scenario.probability, cloudCover: scenario.cloudCover,
    windSpeed: scenario.windSpeed, windGust: scenario.windGust, windDirection: 0,
    weatherCode: scenario.weatherCode ?? (scenario.storm ? 95 : scenario.rain ? 61 : 3) }));
  const dashboard = { openMeteo: { hours } };
  const day = dailyRowsTools.buildDailyRows({ dashboard, now })[0];
  const summary = dailyRowsTools.dailyPeriodSummary(day, now, now + 6 * HOUR, now);
  const e = engine(dashboard);
  const periodCard = e.periodCard({ temperatureMin: 12, temperatureMax: 12, precipitationSum: summary.rain,
    precipitationProbabilityMax: scenario.probability, cloudCover: summary.cloudCover, windSpeedMax: summary.windSpeed,
    windGustMax: summary.windGust, windDirection: 0, storm: scenario.storm, weatherCode: scenario.weatherCode ?? (scenario.storm ? 95 : scenario.rain ? 61 : 3),
    peakRain3h: scenario.rain * 3, rainTiming: summary.rainTiming, stormRainOverlap: scenario.storm && scenario.rain >= 5,
    stormRainWindOverlap: scenario.storm && scenario.rain >= 1 }, 'Matin', '', slot, day.date, day.date + ':morning');
  const dailyCard = e.dailyRowPeriodsMarkup(day, {}, dailyRowsTools.buildDailySourceRows({ dashboard, now }));
  assert.equal(panel(dailyCard), panel(periodCard));
  const notable = html => html.match(/<span class="daily-period-copy">(.*?)<\/span>/)?.[1] || '';
  assert.equal(notable(dailyCard), notable(periodCard));
  const alert = html => html.match(/daily-period-alert-(yellow|orange|red)/)?.[1] || '';
  assert.equal(alert(dailyCard), alert(periodCard));
  assert.equal(dailyCard.includes('daily-period-gust-volume'), periodCard.includes('daily-period-gust-volume'));
  assert.equal(dailyCard.includes('daily-hazard-symbol wind'), periodCard.includes('daily-hazard-symbol wind'));
  assert.equal(dailyCard.includes('daily-hazard-symbol storm'), periodCard.includes('daily-hazard-symbol storm'));
});

test('les seuils des rafales et les trois couleurs sont communs, sans mélange de modèles', () => {
  const e = engine();
  assert.equal(e.forecastPeriodHighlights({ gust: 49 }).gustVolume, '');
  assert.match(e.forecastPeriodHighlights({ gust: 50 }).gustVolume, /50 km\/h/);
  assert.equal(e.forecastPeriodHighlights({ gust: 54 }).hazardMarkup, '');
  assert.match(e.forecastPeriodHighlights({ gust: 55 }).hazardMarkup, /daily-hazard-symbol wind/);
  for (const [gust, color] of [[59, ''], [60, 'yellow'], [80, 'orange'], [100, 'red']])
    assert.equal(e.forecastSlotAlertTone([{ gust }]), color);
  assert.equal(e.forecastSlotAlertTone([{ probability: 95, rain: 1 }, { probability: 10, rain: 40 }]), '');
  assert.equal(e.forecastSlotAlertTone([{ gust: 60 }], 'orange'), 'orange');
  assert.equal(e.forecastSlotAlertTone([{ gust: 100 }], 'yellow'), 'red');
  for (const [rainRate, color] of [[9.9, ''], [10, 'yellow'], [20, 'orange'], [40, 'red']])
    assert.equal(e.forecastSlotAlertTone([{ rainRate, deterministic: true }]), color);
});

const alertHours = (count, rain = 0, extra = {}) => Array.from({ length: count + 1 }, (_, index) => ({
  time: new Date(now + index * HOUR).toISOString(), rain: index ? rain : null,
  liquidRain: index ? rain : null, snowfall: 0, temperature: 6, cloudCover: 100,
  windSpeed: 10, windGust: 20, weatherCode: 61, probability: 100, ...extra
}));
const periodAlert = input => {
  const day = dailyRowsTools.buildDailyRows({ ...input, now })[0];
  const rows = dailyRowsTools.buildDailySourceRows({ ...input, now });
  const summaries = dailyRowsTools.dailyPeriodAlertSummaries(rows, day.date, now, now + 6 * HOUR, now);
  const html = engine(input.dashboard).dailyRowPeriodsMarkup(day, {}, rows);
  return { summaries, tone: html.match(/daily-period-alert-(yellow|orange|red)/)?.[1] || '' };
};

test('avertissement journalier de minuit à minuit à 40 et 50 mm avant arrondi', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  for (const [amount, tone] of [[39.99, ''], [40, 'yellow'], [49.99, 'yellow'], [50, 'orange']]) {
    const hours = alertHours(24, amount / 24, { probability: null }).map((hour, index) =>
      ({ ...hour, time: new Date(midnight + index * HOUR).toISOString() }));
    const input = { dashboard: { arome: { hours } }, now: midnight + 12 * HOUR };
    const days = dailyRowsTools.buildDailyRows(input);
    const alertSources = dailyRowsTools.buildDailySourceRows(input);
    assert.equal(dailyRowsTools.dailyRainAlertTone(alertSources, days[0], input.now), tone);
    const html = dailyRowsTools.dailyRowsMarkup(days, { now: input.now, collapsible: true, alertSources });
    assert.equal(html.match(/data-daily-rain-alert="([^"]+)"/)?.[1] || '', tone);
  }
});

test('le cumul journalier ne mélange pas les modèles ni la pluie avec la neige', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  const hours = (count, amount, extra) => alertHours(count, amount, extra).map((hour, index) =>
    ({ ...hour, time: new Date(midnight + index * HOUR).toISOString() }));
  const tone = dashboard => {
    const input = { dashboard, now: midnight };
    const [day] = dailyRowsTools.buildDailyRows(input);
    return dailyRowsTools.dailyRainAlertTone(dailyRowsTools.buildDailySourceRows(input), day, midnight);
  };
  assert.equal(tone({ arome: { hours: hours(12, 2) }, openMeteo: { hours: hours(24, 2.5) } }), '');
  assert.equal(tone({ arome: { hours: hours(24, 0) }, openMeteo: { hours: hours(24, 3) } }), '');
  assert.equal(tone({ openMeteo: { hours: hours(24, 2.5, { probability: 69 }) } }), '');
  assert.equal(tone({ openMeteo: { hours: hours(24, 2.5, { probability: 70 }) } }), 'orange');
  assert.equal(tone({ arome: { hours: hours(24, 3, { liquidRain: 0, snowfall: 1, weatherCode: 73 }) } }), '');
});

test('couleurs : AROME puis ARPEGE priment sur un scénario Open-Meteo plus alarmant', () => {
  for (const source of ['arome', 'arpege']) {
    const input = { dashboard: { openMeteo: { hours: alertHours(6, 20, { windGust: 120 }) } } };
    const model = { hours: alertHours(6, 0, { probability: null }) };
    if (source === 'arome') input.dashboard.arome = model; else input.week = model;
    const result = periodAlert(input);
    assert.equal(result.tone, '');
    assert.deepEqual(result.summaries.map(s => s.name), [source === 'arome' ? 'AROME' : 'ARPEGE']);
  }
  const input = { dashboard: { arome: { hours: alertHours(6) }, openMeteo: { hours: alertHours(6, 20) } },
    week: { hours: alertHours(6, 20) } };
  assert.equal(periodAlert(input).tone, '', 'AROME prioritaire aussi sur ARPEGE dans ses échéances');
});

test('couleurs : les cumuls déterministes Météo-France ne dépendent pas d’une probabilité Open-Meteo', () => {
  for (const [amount, expected] of [[2.5, 'yellow'], [5, 'orange'], [10, 'red']]) {
    const result = periodAlert({ dashboard: { arome: { hours: alertHours(6, amount, { probability: null }) },
      openMeteo: { hours: alertHours(6, 0, { probability: 0 }) } } });
    assert.equal(result.tone, expected);
    assert.equal(result.summaries[0].probability, null, 'aucune probabilité inventée');
    assert.equal(result.summaries[0].deterministic, true);
  }
});

test('couleurs : relais exact AROME → ARPEGE → Open-Meteo dans un même créneau', () => {
  const input = { dashboard: { arome: { hours: alertHours(2) },
    openMeteo: { hours: alertHours(6, 10, { windGust: 60 }) } }, week: { hours: alertHours(4) } };
  const before = structuredClone(input), result = periodAlert(input);
  assert.deepEqual(result.summaries.map(s => [s.name, s.start, s.end]), [
    ['AROME', now, now + 2 * HOUR], ['ARPEGE', now + 2 * HOUR, now + 4 * HOUR],
    ['Open-Meteo', now + 4 * HOUR, now + 6 * HOUR]
  ]);
  assert.equal(result.summaries[2].rain, 20, 'seul le cumul Open-Meteo hors couverture MF intervient');
  assert.equal(result.tone, 'orange');
  assert.deepEqual(input, before);
});

test('couleurs : Open-Meteo reprend après la couverture MF et dans une vraie absence de données de risque', () => {
  for (const model of [undefined, { hours: alertHours(6).map(h => ({ ...h,
    time: new Date(Date.parse(h.time) - 24 * HOUR).toISOString() })) },
    { hours: alertHours(6, null, { windSpeed: null, windGust: null, weatherCode: null }) }]) {
    const result = periodAlert({ dashboard: { arome: model, openMeteo: { hours: alertHours(6, 0, { windGust: 100 }) } } });
    assert.equal(result.tone, 'red');
    assert.deepEqual(result.summaries.map(s => s.name), ['Open-Meteo']);
  }
});

test('couleurs : le rendu historique privilégie aussi Météo-France, sans supprimer le repli hors couverture', () => {
  const e = engine(), period = { precipitationSum: 80, precipitationProbabilityMax: 100,
    peakRain3h: 40, windSpeedMax: 80, windGustMax: 120, temperatureMin: 5, temperatureMax: 6 };
  const render = (rain, wind) => e.periodCard(period, 'Matin', '', slot, '2026-10-24', 'matin',
    false, [], rain, wind, true);
  assert.ok(!render({ amount: 0 }, { speed: 10, gust: 20 }).includes('daily-period-alert-'));
  assert.match(render({ amount: 30 }, { speed: 10, gust: 20 }), /daily-period-alert-orange/);
  assert.match(render(null, null), /daily-period-alert-red/);
});

test('le survol commun conserve valeurs par source, probabilité et flèches sans dates', () => {
  const e = engine();
  const detail = e.periodSourceDetails([{ name: 'AROME', rain: 1.4, trends: { rain: '↗' } },
    { name: 'Open-Meteo', rain: 2.9, probability: 92, trends: { rain: '↘' } }], 'rain');
  assert.equal(detail.join('\n'), 'AROME : 1,4 mm ↗\nOpen-Meteo : 2,9 mm · 92 % ↘');
});

test('le pictogramme des périodes suit le cumul affiché, sans dilution sur les six heures', () => {
  for (const [total, level] of [[0, 0], [.03, 1], [1.2, 1], [6, 2], [12, 3], [18, 4], [36, 5]]) {
    const dashboard = { arome: { hours: Array.from({ length: 7 }, (_, i) => ({
      time: new Date(now + i * HOUR).toISOString(), temperature: 5, rain: total / 6,
      liquidRain: total / 6, snowfall: 0, cloudCover: 100, windSpeed: 10, windGust: 20
    })) } };
    const day = dailyRowsTools.buildDailyRows({ dashboard, now })[0];
    const html = engine(dashboard).dailyRowPeriodsMarkup(day, {}, [], true);
    assert.match(html, new RegExp('data-rain-level="' + level + '"'), 'cumul ' + total + ' mm');
  }
});

test('les traces portent le libellé gouttes sans unité, et 0,1 mm reste un cumul chiffré', () => {
  for (const total of [.01, .03, .099, .1]) {
    const dashboard = { arome: { hours: Array.from({ length: 7 }, (_, i) => ({
      time: new Date(now + i * HOUR).toISOString(), temperature: 5, rain: total / 6,
      liquidRain: total / 6, snowfall: 0, cloudCover: 100, windSpeed: 10, windGust: 20
    })) } };
    const day = dailyRowsTools.buildDailyRows({ dashboard, now })[0];
    const html = engine(dashboard).dailyRowPeriodsMarkup(day, {}, [], true);
    assert.ok(html.includes(total < .1 ? '<strong>gouttes</strong>' : '<strong>0,1 mm</strong>'));
    assert.ok(!html.includes('gouttes mm'));
  }
});

test('la tendance résume les 25 heures du jour civil, sans la nuit suivante ni les quatre périodes', () => {
  const start = Date.parse('2026-10-25T00:00:00+02:00');
  const dashboard = { openMeteo: { hours: Array.from({ length: 34 }, (_, index) => {
    const i = index - 1, rain = i > 0 && i <= 25 ? .5 : 9;
    return { time: new Date(start + i * HOUR).toISOString(), rain, liquidRain: rain, snowfall: 0,
      temperature: i >= 0 && i < 25 ? 5 + i % 12 : -20, cloudCover: 20, windSpeed: 10, windGust: 49, weatherCode: 61 };
  }) } };
  const day = dailyRowsTools.buildDailyRows({ dashboard, now }).find(day => day.date === '2026-10-25');
  assert.equal((day.end - day.start) / HOUR, 25);
  const html = engine(dashboard).dailyRowDaySummaryMarkup(day);
  assert.equal((html.match(/class="daily-trend-summary"/g) || []).length, 1);
  assert.match(html, /Max\.<\/small><strong>16°/);
  assert.match(html, /Min\.<\/small><b>5°/);
  assert.ok(html.includes('12,5 mm'));
  assert.ok(!html.includes('daily-period-gust-volume'));
  for (const text of ['data-slot-key', '<details', 'Matin', 'Après-midi', 'Soir', 'Nuit']) assert.ok(!html.includes(text), text);
});

test('la synthèse quotidienne ajoute des flocons au-delà de 5 et 15 cm de neige', () => {
  const start = Date.parse('2026-10-26T00:00:00+01:00');
  const cases = [[.25, '&lt; 1', 1], [1, '1', 1], [5, '5', 1], [5.01, '5', 2], [15, '15', 2], [15.01, '15', 3]];
  for (const [total, amount, level] of cases) {
    const dashboard = { openMeteo: { hours: Array.from({ length: 25 }, (_, i) => ({
      time: new Date(start + i * HOUR).toISOString(), rain: (.7 + total) / 24,
      liquidRain: .7 / 24, snowfall: total / 24, cloudCover: 70, weatherCode: 71
    })) } };
    const day = dailyRowsTools.buildDailyRows({ dashboard, now }).find(day => day.date === '2026-10-26');
    const html = engine(dashboard).dailyRowDaySummaryMarkup(day);
    assert.ok(html.includes('<strong>' + amount + ' cm</strong>'));
    assert.ok(html.includes('href="pictogrammes/calque-neige-' + level + '.svg"'), total + ' cm');
    assert.ok(html.includes('<strong>0,7 mm</strong>'));
    assert.ok(html.includes('href="pictogrammes/calque-pluie-1.svg"'));
  }
});

test('la synthèse quotidienne conserve les précipitations inconnues et le seuil des rafales', () => {
  for (const gust of [49, 50]) {
    const dashboard = { openMeteo: { hours: Array.from({ length: 49 }, (_, i) => ({
      time: new Date(now + i * HOUR).toISOString(), temperature: 5, rain: null, liquidRain: null, snowfall: null,
      cloudCover: 50, windSpeed: 10, windGust: gust
    })) } };
    const day = dailyRowsTools.buildDailyRows({ dashboard, now })[1];
    const html = engine(dashboard).dailyRowDaySummaryMarkup(day);
    assert.doesNotMatch(html, /<p(?:\s|>)/);
    assert.ok(!html.includes('Temps sec.'));
    assert.ok(html.includes('<strong>—</strong>'));
    assert.equal(html.includes('daily-period-gust-volume'), gust >= 50);
  }
});
