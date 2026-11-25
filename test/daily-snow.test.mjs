import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyRows, dailyChartMarkup, dailyRainBars, piafChartMarkup } from '../public/daily-rows.js';
import { prepareBasicForecast } from '../public/forecast-core.js';
import { snowDemoData } from './fixtures/snow-demo.mjs';

test('24 h : neige blanche et congères partagées avec la frise 3 h, sans changer les quantités', () => {
  const input = snowDemoData(), before = structuredClone(input);
  const [day] = buildDailyRows({ ...input, piafForChart: true });
  const bars = dailyRainBars({ ...day, rainIntervals: day.chartRainIntervals });
  for (const width of [360, 1200]) {
    const html = dailyChartMarkup(day, { now: input.now, width });
    assert.ok(html.includes('class="piaf-snow-bar"'));
    assert.ok(html.includes('class="piaf-snow-cap"'));
    assert.ok(!html.includes('<pattern'), 'plus de rectangles hachurés');
    assert.ok(html.includes('mm/h équiv. eau'), 'échelle 24 h inchangée et explicite');
    const cap = html.match(/class="piaf-snow-cap" d="([^"]+)"/)[1];
    assert.ok(cap.includes(' C'));
    assert.ok(!/[LV]/.test(cap), 'aucun raccord vertical des congères');
    const amounts = [...html.matchAll(/<g class="chart-point[^>]*data-rain-amount="([^"]+)"/g)]
      .filter(m => !m[0].includes('data-adjacent-day'))
      .reduce((sum, m) => sum + Number(m[1]), 0);
    assert.ok(Math.abs(amounts - bars.reduce((sum, bar) => sum + bar.rain, 0)) < 1e-8);
    assert.equal(dailyChartMarkup(day, { now: input.now, width }), html, 'décor stable au rafraîchissement');
  }
  const three = piafChartMarkup(prepareBasicForecast(input.dashboard, input.now), { ...input, compact: true });
  assert.ok(three.includes('class="piaf-snow-cap"'));
  assert.deepEqual(input, before);
});

test('24 h : les congères s’arrêtent aux périodes sèches et les précipitations mixtes gardent le bleu', () => {
  for (const scenario of ['mixed', 'breaks']) {
    const input = snowDemoData(scenario), [day] = buildDailyRows({ ...input, piafForChart: true });
    const html = dailyChartMarkup(day, { now: input.now, width: 1200 });
    if (scenario === 'mixed') {
      assert.match(html, /class="chart-point day-combined-mixed"[^>]*><rect[^>]*class="day-combined-rain"\/><rect class="piaf-snow-bar"/);
    } else {
      const cap = html.match(/class="piaf-snow-cap" d="([^"]+)"/)[1];
      assert.ok((cap.match(/M/g) || []).length > 3, 'plusieurs congères indépendantes');
      const groups = [...html.matchAll(/<g class="chart-point day-combined-snow"[^>]*data-rain-amount="([^"]+)"/g)];
      assert.ok(groups.every(group => Number(group[1]) > 0), 'aucune congère dans le sec');
    }
  }
});

test('24 h compactes : la pluie et la neige couvrent le même créneau et les gouttes décorent la pluie seule', () => {
  const now = Date.parse('2026-11-26T00:00:00+01:00');
  const hours = [[.8, .56], [0, 0], [8, .14], [2, 0]].map(([liquidRain, snowfall], index) => ({
    time: new Date(now + (index + 1) * 3600000).toISOString(),
    rain: liquidRain + snowfall / .7, liquidRain, snowfall, weatherCode: snowfall ? 85 : 3,
  }));
  const [day] = buildDailyRows({ now, dashboard: { arome: { hours } } });
  for (const width of [360, 1200]) {
    const html = dailyChartMarkup(day, { now, width, compactRain: true });
    const mixed = [...html.matchAll(/<g class="chart-point day-combined-mixed"[^>]*><rect class="piaf-snow-bar" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"\/><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="day-combined-rain"/g)];
    assert.equal(mixed.length, 2, 'le créneau sec reste vide');
    const snowTaller = mixed.map(([, snowX, snowY, snowWidth, snowHeight, rainX, rainY, rainWidth, rainHeight]) => {
      assert.equal(snowX, rainX);
      assert.equal(snowWidth, rainWidth);
      assert.ok(Math.abs(Number(snowY) + Number(snowHeight) - Number(rainY) - Number(rainHeight)) < 1e-9);
      return Number(snowHeight) > Number(rainHeight);
    });
    assert.deepEqual(snowTaller, [true, false]);
    const mixedBars = [...html.matchAll(/<g class="chart-point day-combined-mixed"[^>]*>[\s\S]*?<\/g>/g)];
    for (const [bar] of mixedBars) assert.doesNotMatch(bar, /rain-bar-drop/);
    assert.match(html, /class="rain-bar-drop"/, 'la pluie seule conserve les gouttes');
    assert.match(html, /Pluie mm\/h[\s\S]*Neige cm\/h/);
  }
});

test('frises 3 h et 24 h : la neige faible occupe une petite fraction de l’échelle', () => {
  const now = Date.parse('2026-11-26T00:00:00+01:00');
  const end = now + 3600000;
  const forecast = { rainSteps: [{ intervalStart: now, intervalEnd: end, precipitation: .8 }] };
  for (const [snowfall, maximum] of [[.1, 5], [.5, 5], [1.25, 5], [8, 10]]) {
    const hours = [{ time: new Date(end).toISOString(), rain: .8, liquidRain: 0, snowfall, weatherCode: 73 }];
    const dashboard = { arome: { hours } };
    const [day] = buildDailyRows({ now, dashboard });
    for (const width of [360, 1200]) {
      const daily = dailyChartMarkup(day, { now, width, compactRain: true });
      const short = piafChartMarkup(forecast, { now, width, dashboard, compact: true, compactRain: true, precipitationOnly: true });
      assert.ok(daily.includes(`Neige, échelle de 0 à ${maximum} cm/h`));
      assert.ok(short.includes(`0 à ${maximum} cm/h`));
      const baseline = Number(daily.match(/class="day-combined-svg"[^>]*viewBox="0 0 \S+ (\d+)"/)[1]);
      const shortRange = Number(short.match(/class="piaf-snow-scale-bar"[^>]*height="([^"]+)"/)[1]);
      for (const [html, range] of [[daily, baseline / 2], [short, shortRange]]) {
        const height = Number(html.match(/class="piaf-snow-bar"[^>]*height="([^"]+)"/)[1]);
        assert.ok(Math.abs(height / range - snowfall / maximum) < 1e-9);
        if (snowfall <= .5 && height < 12) {
          const outline = Number(html.match(/class="piaf-snow-cap-outline"[^>]*style="stroke-width:([^"]+)"/)[1]);
          assert.ok(outline > 0 && outline < height, 'la congère reste fine sur les petites barres');
        }
      }
    }
  }
});
