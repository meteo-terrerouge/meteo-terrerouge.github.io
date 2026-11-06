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
