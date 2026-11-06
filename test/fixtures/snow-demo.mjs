// Synthetic local demonstration only. Never used by a collector or a build.
export const snowDemoNow = Date.parse('2026-11-07T06:00:00Z');
const HOUR = 3600000;
export function snowDemoData(scenario = 'snow') {
  const midnight = Date.parse('2026-11-06T23:00:00Z');
  const weather = index => {
    const dry = scenario === 'breaks' && [9, 10, 15, 16].includes(index);
    const mixed = scenario === 'mixed' && index >= 7 && index < 14;
    const snow = [.6, .6, 1.2, 1.2, 2.4, 2.4, 1.2, .6][index % 8];
    return { temperature: mixed ? 1.2 : -2.5 + Math.sin(index / 4), cloudCover: dry ? 30 : 95,
      rain: dry ? 0 : mixed ? 3.2 : snow * 1.1,
      liquidRain: dry || !mixed ? 0 : 1.2, snowfall: dry ? 0 : mixed ? 1.1 : snow,
      weatherCode: dry ? 2 : 73, snowfallMethod: 'provider-estimate', windSpeed: 9, windGust: 18 };
  };
  const hours = Array.from({ length: 36 }, (_, index) => ({
    time: new Date(midnight + (index + 1) * HOUR).toISOString(), ...weather(index),
    rainIntervalStart: new Date(midnight + index * HOUR).toISOString(),
    rainIntervalEnd: new Date(midnight + (index + 1) * HOUR).toISOString()
  }));
  const piaf = { coverageId: 'RAIN___2026-11-07T06.00.00Z_PT5M', fetchedAt: snowDemoNow,
    values: Array.from({ length: 36 }, (_, index) => {
      const owner = weather(7 + Math.floor(index / 12));
      return { seconds: (index + 1) * 300, precipitation: owner.rain / 12 };
    }) };
  return { dashboard: { arome: { hours, fetchedAt: snowDemoNow }, piaf }, week: {}, now: snowDemoNow };
}
