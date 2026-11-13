import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as dailyRowsTools from '../public/daily-rows.js';
import { compactCardsMarkup } from '../public/compact-forecast.js';
import { collectWeather } from '../scripts/collect-weather.mjs';
import { mergeWeatherState, publicWeatherFiles } from '../weather/state.mjs';

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
  return runInNewContext(code + '\n({periodCard, dailyRowDaySummaryMarkup, dailyRowPeriodsMarkup, forecastPeriodDetailsMarkup, forecastPeriodHighlights, periodSourceDetails, forecastSlotAlertTone, rainProbabilitySummary, rainPictogramStep})', {
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

const compactCard = (day, input) => {
  const { forecastSlotAlertTone, rainPictogramStep } = engine();
  return compactCardsMarkup([day], { ...input, ...dailyRowsTools, siteId: 'test',
    alertSources: dailyRowsTools.buildDailySourceRows(input), forecastSlotAlertTone, rainPictogramStep });
};

test('les flèches des vignettes utilisent les cycles publiés même sans historique local', async () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  const profile = { id: 'test', latitude: 44, longitude: 5, timezone: 'Europe/Paris', features: { arome: true } };
  const run = (index, extra = {}) => ({
    runTime: new Date(midnight - (4 - index) * HOUR).toISOString(),
    fetchedAt: midnight - (3 - index) * HOUR,
    hours: alertHours(24, 1 - index * .3, { temperature: 5 + index }).map((hour, offset) =>
      ({ ...hour, time: new Date(midnight + offset * HOUR).toISOString() })),
    ...extra
  });
  const collect = async (entry, arome) => (await collectWeather({ profile, entry, group: 'forecast',
    collectors: { buildArome: async () => arome } })).entry;
  const first = await collect({}, run(0));
  const second = await collect(first, run(1));
  const repeated = await collect(second, run(1, { fetchedAt: second.arome.fetchedAt + 1000 }));
  assert.equal(repeated.forecastHistory.length, 1);
  const third = await collect(repeated, run(2));
  const merged = mergeWeatherState(third, second);
  assert.equal(merged.arome.runTime, third.arome.runTime);
  assert.deepEqual(merged.forecastHistory.map(revision => revision.sources.AROME.runTime), [first.arome.runTime, second.arome.runTime]);

  const render = entry => {
    const { data } = publicWeatherFiles(profile, entry)['dashboard.json'];
    const input = { dashboard: data, week: {}, now: midnight, timezone: profile.timezone };
    const [day] = dailyRowsTools.buildDailyRows(input);
    return compactCard(day, input);
  };
  assert.doesNotMatch(render(second), /class="trend-arrow /);
  const html = render(merged);
  assert.match(html, /class="trend-arrow trend-temperature trend-up"[^>]*sur 3 relevés comparables/);
  assert.match(html, /class="trend-arrow trend-rain trend-down"[^>]*sur 3 relevés comparables/);
  const fourth = await collect(third, run(3));
  assert.doesNotMatch(render({ ...second, forecastHistory: fourth.forecastHistory }), /class="trend-arrow /);
});

test('la vignette compte le cumul de pluie liquide et la frise son intensité', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  for (const { rain, liquidRain, snowfall, cardDrops } of [
    { rain: 1.8, liquidRain: 1.8, snowfall: 0, cardDrops: 5 },
    { rain: 2.5, liquidRain: .6, snowfall: 1, cardDrops: 3 },
  ]) {
    const hours = alertHours(24, rain, { liquidRain, snowfall }).map((hour, index) =>
      ({ ...hour, time: new Date(midnight + index * HOUR).toISOString() }));
    const input = { dashboard: { arome: { hours } }, week: {}, now: midnight, timezone: 'Europe/Paris' };
    const [day] = dailyRowsTools.buildDailyRows(input);
    const card = compactCard(day, input);
    const chart = dailyRowsTools.dailyChartMarkup(day, { now: midnight, width: 2400 });
    assert.deepEqual([...card.matchAll(/calque-pluie-([1-5])\.svg/g)].map(match => Number(match[1])), [cardDrops]);
    assert.deepEqual([...new Set([...chart.matchAll(/data-rain-level="([1-5])"/g)].map(match => Number(match[1])))], [1]);
  }
});

test('chaque pictogramme utilise le cumul de son propre créneau sur une vignette à deux conditions', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  const hours = alertHours(24).map((hour, index) => {
    const rain = index > 12 ? 3 : 1;
    return { ...hour, time: new Date(midnight + index * HOUR).toISOString(), rain, liquidRain: rain, stormSignal: index >= 12 };
  });
  const input = { dashboard: { arome: { hours } }, week: {}, now: midnight, timezone: 'Europe/Paris' };
  const [day] = dailyRowsTools.buildDailyRows(input);
  const html = compactCard(day, input);
  assert.match(html, /class="period">Matin<[\s\S]*?calque-pluie-2\.svg[\s\S]*?class="period">Après-midi<[\s\S]*?calque-pluie-4\.svg/);
});

test('la vignette distingue une accalmie autour de midi des épisodes avant et après', () => {
  const midnight = Date.parse('2026-11-15T00:00:00+01:00');
  const render = (gap = false) => {
    const hours = alertHours(24).map((hour, index) => {
      const rain = index > 0 && index <= 9 ? 1 : index > 16 ? 1.475 : 0;
      return { ...hour, time: new Date(midnight + index * HOUR).toISOString(),
        rain: gap && index === 12 ? null : rain, liquidRain: rain, stormSignal: index < 5 };
    });
    const input = { dashboard: { arome: { hours } }, week: {}, now: midnight - 2 * HOUR, timezone: 'Europe/Paris' };
    const day = dailyRowsTools.buildDailyRows(input).find(day => day.date === '2026-11-15');
    return compactCard(day, input);
  };
  const html = render();
  assert.match(html, /data-pictograms="3"/);
  const conditions = html.split('class="condition"').slice(1);
  assert.match(conditions[0], /Avant 9 h[\s\S]*calque-pluie-3\.svg[\s\S]*calque-orage\.svg/);
  assert.match(conditions[1], /En journée[\s\S]*temps sec/);
  assert.doesNotMatch(conditions[1], /calque-(pluie|orage)/);
  assert.match(conditions[2], /Dès 16 h[\s\S]*calque-pluie-3\.svg[\s\S]*class="rain-amount">20,8<\/span>/);
  assert.doesNotMatch(render(true), /data-pictograms="3"/);
});

test('le cumul quotidien de neige fraîche apparaît en cm à côté de la pluie liquide', () => {
  const midnight = Date.parse('2026-11-23T00:00:00+01:00');
  for (const [snowfall, expected] of [[0, ''], [.04, '&lt; 1'], [1, '6']]) {
    const hours = alertHours(24).map((hour, index) => {
      const snow = index > 18 ? snowfall : 0;
      return { ...hour, time: new Date(midnight + index * HOUR).toISOString(), rain: .4083333333333333 + snow,
        liquidRain: 9.8 / 24, snowfall: snow, weatherCode: snow ? 71 : 61 };
    });
    const input = { dashboard: { openMeteo: { hours } }, week: {}, now: midnight - 2 * HOUR, timezone: 'Europe/Paris' };
    const day = dailyRowsTools.buildDailyRows(input).find(day => day.date === '2026-11-23');
    const html = compactCard(day, input);
    assert.match(html, /class="rain-amount">9,8<\/span><span class="rain-unit">mm/);
    if (expected) assert.match(html, new RegExp(`class="rain-reading snow-total"[^>]*><span class="rain-amount">${expected}</span><span class="rain-unit">cm</span>`));
    else assert.doesNotMatch(html, /class="rain-reading snow-total"/);
  }
});

test('les vignettes mettent en évidence chaque mesure dès le jaune', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  for (const { rain, gust, tone, metrics } of [
    { rain: 0, gust: 68, tone: 'yellow', metrics: ['gust-speed'] },
    { rain: 39.99, gust: 99, tone: 'orange', metrics: ['gust-speed'] },
    { rain: 42.9, gust: 99, tone: 'orange', metrics: ['gust-speed', 'rain-amount'] },
    { rain: 42.9, gust: 105, tone: 'red', metrics: ['gust-speed', 'rain-amount'] },
    { rain: 50, gust: 68, tone: 'orange', metrics: ['gust-speed', 'rain-amount'] },
    { rain: 144, gust: 85, tone: 'red', metrics: ['gust-speed', 'rain-amount'] },
  ]) {
    const hours = alertHours(24, rain / 24, { windGust: gust }).map((hour, index) =>
      ({ ...hour, time: new Date(midnight + index * HOUR).toISOString() }));
    const input = { dashboard: { arome: { hours } }, week: {}, now: midnight, timezone: 'Europe/Paris' };
    const [day] = dailyRowsTools.buildDailyRows(input);
    const html = compactCard(day, input);
    assert.equal(html.match(/data-alert="([^"]+)"/)?.[1], tone);
    assert.deepEqual([...html.matchAll(/class="([^" ]+) alert-value"/g)].map(match => match[1]), metrics);
    assert.match(html, new RegExp('Rafales jusqu’à ' + gust + ' km/h'));
    assert.doesNotMatch(html, /Vent moyen jusqu’à|class="wind-divider"/);
    assert.equal([...html.matchAll(/class="gust-unit"/g)].length, 1);
    if (metrics.includes('rain-amount')) {
      assert.match(html, /class="rain-reading"[^>]*><span class="rain-amount alert-value">/);
    }
    if (rain > 0) assert.doesNotMatch(html, /class="rain-drop"/);
    else assert.match(html, /class="rain-drop"[\s\S]*?class="dry-slash"/);
  }
});

test('les vignettes ajoutent le vent moyen aux rafales à partir de 20 km/h', () => {
  const midnight = Date.parse('2026-10-24T00:00:00+02:00');
  for (const windSpeed of [19.9, 20]) {
    const hours = alertHours(24, 0, { windSpeed, windGust: 53 }).map((hour, index) =>
      ({ ...hour, time: new Date(midnight + index * HOUR).toISOString() }));
    const input = { dashboard: { arome: { hours } }, week: {}, now: midnight, timezone: 'Europe/Paris' };
    const [day] = dailyRowsTools.buildDailyRows(input);
    const html = compactCard(day, input);
    assert.match(html, /Rafales jusqu’à 53 km\/h/);
    assert.equal(html.includes('Vent moyen jusqu’à 20 km/h'), windSpeed === 20);
    assert.equal(html.includes('class="wind-divider"'), windSpeed === 20);
  }
});

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
