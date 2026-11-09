const temperature = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const rainfall = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const roundedRainfall = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const notableGust = 50;
const skyLabels = ['Dégagé', 'Peu nuageux', 'Éclaircies', 'Nuageux', 'Très nuageux', 'Couvert'];
const skyBand = cloud => [5, 25, 50, 75, 90, Infinity].findIndex(limit => cloud <= limit);
const rainBand = rain => rain < .01 ? 0 : [3, 8, 15, 30, Infinity].findIndex(limit => rain < limit) + 1;
const snowPhases = ['snow', 'snow-unknown', 'mixed'];
const formatTemp = value => value == null ? '—' : temperature.format(value).replace('-', '−') + '°';
const alertLabels = { yellow: 'Alerte du bulletin jaune', orange: 'Alerte du bulletin orange', red: 'Alerte du bulletin rouge' };

function image(path, className = '') {
  return '<img alt=""' + (className ? ' class="' + className + '"' : '') + ' src="' + path + '">';
}

function trendArrow(direction, metric, description) {
  return `<span class="trend-arrow trend-${metric} trend-${direction}" role="img" aria-label="${description}" title="${description}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5"/></svg></span>`;
}

function comparableSeries(periods, sourceOf, valueOf) {
  const current = periods.at(-1)?.period;
  const model = current && sourceOf(current);
  if (!model || model.includes(' · ') || !Number.isFinite(valueOf(current))) return [];
  const byRun = new Map();
  for (const { period, sources } of periods) {
    if (!period || sourceOf(period) !== model) continue;
    const value = valueOf(period);
    const source = sources[model];
    const timestamp = new Date(source?.runTime ?? source?.fetchedAt).valueOf();
    if (Number.isFinite(value) && Number.isFinite(timestamp)) byRun.set(timestamp, value);
  }
  return [...byRun].sort((left, right) => left[0] - right[0]).map(([, value]) => value);
}

function globalDirection(series, threshold) {
  if (series.length < 3) return '';
  const median = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  };
  const half = Math.floor(series.length / 2);
  const earlier = series.slice(0, half);
  const recent = series.slice(-half);
  const difference = median(recent) - median(earlier);
  if (Math.abs(difference) < threshold) return '';
  const agrees = change => Math.sign(difference) * change >= threshold / 4;
  // A single jump or a lone outlier is not enough to confirm a direction.
  if (series.length === 3) {
    if (!agrees(series[1] - series[0]) || !agrees(series[2] - series[1])) return '';
  } else {
    const comparisons = earlier.flatMap(before => recent.map(after => agrees(after - before)));
    if (comparisons.filter(Boolean).length < .75 * comparisons.length) return '';
  }
  return difference > 0 ? 'up' : 'down';
}

function trend(series, threshold, metric, label) {
  const direction = globalDirection(series, threshold);
  if (!direction) return '';
  const movement = direction === 'up' ? 'à la hausse' : 'à la baisse';
  return trendArrow(direction, metric, `${label} ${movement} sur ${series.length} relevés comparables`);
}

const precipitationSource = period => period.completeRain && period.rainSources.length === 1 ? period.rainSources[0] : '';

function weatherTrends(periods) {
  const snow = comparableSeries(periods, precipitationSource, period => period.snowfall);
  const storm = comparableSeries(periods, period => period.sources.storm, period => period.storm == null ? null : Number(period.storm));
  return trend(snow, .5, 'snow', 'Tendance neige') + trend(storm, .5, 'storm', 'Tendance du signal orageux');
}

function liquidRainText(period) {
  if (!period.completeRain) return null;
  if (Number.isFinite(period.liquidRain)) {
    return period.liquidRain > 0 && period.liquidRain < .01 ? '&lt; 0,01' : rainfall.format(period.liquidRain);
  }
  let known = 0;
  let unclassified = 0;
  for (const interval of period.intervals) {
    if (Number.isFinite(interval.liquidRain)) known += interval.liquidRain;
    else unclassified += interval.rain;
  }
  const lower = roundedRainfall.format(known);
  // Keep a value only when the unclassified amount cannot change the displayed precision.
  return known >= .1 && lower === roundedRainfall.format(known + unclassified) ? lower : null;
}

function dailyRainMarkup(dayTotal, periods) {
  const value = liquidRainText(dayTotal);
  const available = value != null;
  const dry = dayTotal.completeRain && dayTotal.liquidRain === 0;
  const rain = comparableSeries(periods, precipitationSource, period => period.liquidRain);
  const label = dry ? 'Pas de pluie de minuit à minuit' : available ? 'Cumul de pluie de minuit à minuit' : 'Cumul de pluie de minuit à minuit indisponible';
  return `<span class="rain-total" title="${label}">
    <svg class="rain-drop" viewBox="0 0 24 24" ${dry ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path d="M12 2.8C9.5 6.4 6.8 9.7 6.8 13.2a5.2 5.2 0 0 0 10.4 0C17.2 9.7 14.5 6.4 12 2.8Z"/>${dry ? '<path class="dry-slash" d="M5 5 19 19" fill="none" stroke="#fff" stroke-width="4"/><path d="M5 5 19 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : ''}</svg>
    ${dry ? '' : `<span class="rain-reading" aria-label="${available ? label + ' ' + value + ' mm' : label}"><span class="rain-amount">${value ?? '—'}</span>${available ? '<span class="rain-unit">mm</span>' : ''}</span>`}
    ${trend(rain, 2, 'rain', 'Tendance du cumul de pluie')}
  </span>`;
}

function gustMarkup(gust) {
  if (!(gust >= notableGust)) return '';
  const speed = temperature.format(gust);
  const label = `Rafales jusqu’à ${speed} km/h`;
  return `<span class="gust-total" title="${label}" aria-label="${label}"><span class="gust-speed" aria-hidden="true">${speed}</span><span class="gust-unit" aria-hidden="true"><span>km</span><span>h</span></span></span>`;
}

function temperatureMean(period) {
  if ("meanTemperature" in period) return period.meanTemperature;
  let duration = 0;
  let total = 0;
  for (const sample of period.samples) {
    if (!Number.isFinite(sample.temperature)) continue;
    const elapsed = Math.min(period.end, sample.intervalEnd) - Math.max(period.begin, sample.stamp);
    duration += elapsed;
    total += elapsed * sample.temperature;
  }
  return duration && duration >= period.end - period.begin ? total / duration : null;
}

function condition(period, arrows, label = '', night = false) {
  const cloud = period.cloudCover ?? (period.rain > 0 ? 100 : null);
  const rain = rainBand(period.rain ?? 0);
  const snow = snowPhases.includes(period.phase) && period.snowfall > 0;
  const mixed = snow && period.liquidRain > .1;
  const freezing = period.phase === 'freezing';
  const band = Math.max(rain ? 1 : 0, skyBand(cloud));
  const sky = cloud == null ? '' : image('vendor/weather-variants/cloud-' + (night ? 'night' : 'day') + '-' + band + '.svg');
  const layer = freezing ? 'pictogrammes/pluie-verglacante.svg'
    : snow ? 'pictogrammes/' + (mixed ? 'calque-pluie-neige' : 'calque-neige-' + (period.snowfall >= 1 ? 3 : period.snowfall >= .2 ? 2 : 1)) + '.svg'
    : rain ? 'pictogrammes/calque-pluie-' + rain + '.svg' : '';
  const weather = period.storm ? 'Orage possible' : freezing ? 'Pluie verglaçante'
    : snow ? (mixed ? 'Pluie et neige' : 'Neige') : rain ? 'Pluie' : cloud == null ? 'Indisponible' : skyLabels[band];
  const wind = period.windGust >= notableGust ? image('pictogrammes/calque-vent.svg', 'wind-layer') : '';
  const dry = period.completeRain && period.phase === 'dry' && !period.storm;
  const description = [weather, dry ? 'temps sec' : '', wind ? 'rafales' : ''].filter(Boolean).join(', ');
  const precipitation = layer ? image(layer, !freezing && (snow ? mixed : rain > 0) ? 'rain-layer' : '') : '';
  return `<div class="condition">${label ? `<span class="period">${label}</span>` : ''}
    <span class="weather-summary"><span class="pictogram" role="img" aria-label="${description}" title="${description}">${freezing ? '' : sky}${precipitation}${period.storm ? image('pictogrammes/calque-orage.svg') : ''}${wind}</span>${arrows ? `<span class="weather-trends">${arrows}</span>` : ''}</span></div>`;
}

function changeScore(before, after) {
  if (!before.available || !after.available) return 0;
  if (before.storm != null && after.storm != null && before.storm !== after.storm) return 100;
  if (!before.completeRain || !after.completeRain) return 0;
  if (snowPhases.includes(before.phase) !== snowPhases.includes(after.phase) || (before.phase === 'freezing') !== (after.phase === 'freezing')) return 90;
  const low = Math.min(before.rain, after.rain);
  const high = Math.max(before.rain, after.rain);
  if (low < .01 && high >= .1) return 60 + Math.min(high, 29);
  if (high < .1 && before.cloudCover != null && after.cloudCover != null) {
    const distance = Math.abs(before.cloudCover - after.cloudCover);
    if (distance >= 45 && Math.max(before.cloudCover, after.cloudCover) >= 80) return distance / 2;
  }
  return 0;
}

function card(day, { now, today, tomorrow, dates, localHour, alertSources, history, forecastSlotAlertTone,
  dailyPeriodAlertSummaries, dailyPeriodSummary, dailyRainAlertTone }) {
  const { weekday, day: number, month } = Object.fromEntries(dates.formatToParts(day.start).map(part => [part.type, part.value]));
  const dayLabel = day.date === today ? 'Aujourd’hui' : day.date === tomorrow ? 'Demain' : weekday;
  const chartTitle = `${weekday.charAt(0).toLocaleUpperCase('fr-FR')}${weekday.slice(1)} ${number} ${month}`;
  const localHours = new Map(day.samples.map(sample => [
    Number(localHour.formatToParts(sample.stamp).find(part => part.type === 'hour').value), sample.stamp,
  ]));
  const at = hour => hour === 24 ? day.end : hour === 0 ? day.start : localHours.get(hour);
  const summarize = (row, start, end) => dailyPeriodSummary(row, start, end, Math.min(now, day.start));
  const range = (from, to) => summarize(day, at(from), at(to));
  const periods = (start, end) => history.map(({ days, sources }) => ({
    period: days[day.date]?.[start + '-' + end], sources,
  }));
  const arrows = (from, to) => weatherTrends(periods(at(from), at(to)));
  const morning = range(6, 12);
  const afternoon = range(12, 18);
  const evening = range(18, 24);
  const totals = summarize(day, day.start, day.end);
  const dailyHistory = periods(day.start, day.end);
  const meanTemperatures = comparableSeries(dailyHistory, period => period.sources.temperature, temperatureMean);
  const daySummary = { ...totals, cloudCover: range(6, 18).cloudCover, storm: morning.storm || afternoon.storm || evening.storm };
  const atNoon = changeScore(morning, afternoon);
  const atEvening = changeScore(afternoon, evening);
  const split = Math.max(atNoon, atEvening) > 0;
  const wholeDaytime = morning.rain >= .1 && afternoon.rain >= .1 && morning.storm === afternoon.storm;
  const conditions = !split ? condition(daySummary, weatherTrends(dailyHistory)) : atNoon >= atEvening
    ? condition(morning, arrows(6, 12), 'Matin') + condition(afternoon, arrows(12, 18), 'Après-midi')
    : condition(afternoon, arrows(wholeDaytime ? 6 : 12, 18), wholeDaytime ? 'Avant 18 h' : 'Après-midi') + condition(evening, arrows(18, 24), 'Soir', true);
  const alerts = [0, 6, 12, 18].filter(hour => at(hour + 6) > now)
    .flatMap(hour => dailyPeriodAlertSummaries(alertSources, day.date, at(hour), at(hour + 6), now));
  const dailyTone = dailyRainAlertTone(alertSources, day, now);
  const tone = forecastSlotAlertTone(alerts.map(item => ({ ...item, wind: item.windSpeed, gust: item.windGust })), dailyTone);
  const alert = tone ? ` data-alert="${tone}"${dailyTone ? ` data-daily-rain-alert="${dailyTone}"` : ''} aria-label="${dayLabel} ${number} ${month}. ${alertLabels[tone]}."` : '';
  return `<li><article class="card${split ? ' card-transition' : ''}${day.trend ? ' card-outlook' : ''}" data-pictograms="${split ? 2 : 1}"${alert}>
    <h2 class="card-heading">${day.trend ? '<span class="outlook-label"><span>Tendance</span></span>' : ''}<time datetime="${day.date}"><span>${dayLabel}</span><small>${number} ${month}</small></time></h2>
    <div class="conditions">${conditions}</div>
    <div class="card-metrics">
      <div class="temperatures">
        <span class="temperature-values" role="group" aria-label="Température minimale ${formatTemp(totals.temperatureMin)}, maximale ${formatTemp(totals.temperatureMax)}"><span class="min" aria-hidden="true">${formatTemp(totals.temperatureMin)}</span><span class="temperature-divider" aria-hidden="true">/</span><span class="max" aria-hidden="true">${formatTemp(totals.temperatureMax)}</span></span>
        ${trend(meanTemperatures, 1, 'temperature', 'Tendance de la température moyenne')}
      </div>
      ${gustMarkup(totals.windGust)}
      ${dailyRainMarkup(totals, dailyHistory)}
    </div>
    <button type="button" class="card-chart-hit" data-date="${day.date}" data-title="${chartTitle}" aria-haspopup="dialog" aria-label="Ouvrir le graphique du ${number} ${month}"></button>
  </article></li>`;
}


function forecastHistory(days, { dashboard, week, now, timezone, siteId, dailyPeriodSummary }) {
  const datasets = { AROME: dashboard.arome, ARPEGE: week, 'Open-Meteo': dashboard.openMeteo };
  const sources = Object.fromEntries(Object.entries(datasets).flatMap(([name, data]) => {
    const runTime = data?.runTime ?? data?.fetchedAt;
    return runTime ? [[name, { runTime }]] : [];
  }));
  const key = 'meteo-compact-history-' + siteId;
  const current = { sources, days: {} };
  const localHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone });
  for (const day of days) {
    const hours = new Map(day.samples.map(sample => [Number(localHour.format(sample.stamp)), sample.stamp]));
    hours.set(0, day.start);
    hours.set(24, day.end);
    const periods = current.days[day.date] = {};
    for (const [from, to] of [[0,24], [6,12], [12,18], [6,18], [18,24]]) {
      const start = hours.get(from), end = hours.get(to);
      if (start == null || end == null) continue;
      const period = dailyPeriodSummary(day, start, end, Math.min(now, day.start));
      periods[start + '-' + end] = {
        sources: period.sources, rainSources: period.rainSources, completeRain: period.completeRain,
        liquidRain: period.liquidRain, snowfall: period.snowfall, storm: period.storm, meanTemperature: temperatureMean(period)
      };
    }
  }
  let history = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(saved)) history = saved.filter(item => item?.days && item.sources);
  } catch {}
  const id = JSON.stringify(sources);
  // Replace an incomplete copy of the same model runs and keep recent revisions.
  history = [...history.filter(item => JSON.stringify(item.sources) !== id), current].slice(-8);
  try { localStorage.setItem(key, JSON.stringify(history)); } catch {}
  return history;
}

export function compactCardsMarkup(days, options) {
  if (!days.length) return '<p class="week-source-message">Prévisions en attente d’actualisation.</p>';
  const { now, timezone, localDateKey } = options;
  const today = localDateKey(now, timezone);
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const dates = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone });
  const localHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone });
  const history = forecastHistory(days, options);
  return '<ul class="week">' + days.map(day => card(day, { ...options, today, tomorrow, dates, localHour, history })).join('') + '</ul>';
}
