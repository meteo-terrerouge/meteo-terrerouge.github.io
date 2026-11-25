const size = 128;
const precipitationGap = 12;
const skidGap = 7;
const wind = { path: 'pictogrammes/calque-vent.svg', width: 41.0423, height: 22.9409, centerX: 64, centerY: 55.4983 };
const bolt = { path: 'pictogrammes/calque-orage.svg', width: 23.8, height: 47.6, right: 104.9, bottom: 60.2, centerX: 93, centerY: 36.4 };
const rainTop = 93.275;
const snowTop = 91.15; // Includes the flake stroke.
const traceTop = 85.15;
const freezingRainTop = 73.275;
const freezingRainHeight = 14.45;

// Bounds of the front cloud or clear-sky symbol after placing the sky layer.
// Each row contains left, top, right, bottom and half the stroke width.
const cloudBounds = [
  [41.09095, 52.63007, 86.91, 81.05, .348],
  [35.16619, 44.65509, 92.835, 80.425, .438],
  [28.45147, 35.15011, 99.55, 79.25, .54],
  [22.92170, 29.44013, 105.08, 80.4, .624],
  [19.76183, 27.32014, 108.24, 82.2, .672]
];
const clearDayBounds = [33.76, 17.76, 94.24, 78.24, 0];
const clearNightBounds = [38.05503, 23.36, 72.96, 72.64, 0];
const freezingCloudBounds = [24.50163, 19.00012, 103.5, 68, .6];

function layer(path, x = 0, y = 0, scale = 1) {
  const length = Number((size * scale).toFixed(4));
  return '<image href="' + path + '" x="' + Number(x.toFixed(4)) + '" y="' + Number(y.toFixed(4)) +
    '" width="' + length + '" height="' + length + '"/>';
}

function layout([left, top, right, bottom, stroke], hasCloud) {
  const width = right - left;
  const height = bottom - top;
  const centerY = (top + bottom) / 2;
  const precipitationTop = bottom + stroke + precipitationGap;
  if (hasCloud) {
    const centerX = (left + right) / 2;
    const windScale = Math.min(1, .82 * width / wind.width, .71 * height / wind.height);
    // Keep the tip just inside the upper-right edge of the front cloud.
    const tip = top + .34 * height;
    const boltScale = Math.min(1, .32 * width / bolt.width, .9 * height / bolt.height, (tip - 3) / bolt.height);
    return {
      precipitationTop,
      wind: layer(wind.path, centerX - wind.centerX * windScale, centerY - wind.centerY * windScale, windScale),
      bolt: layer(bolt.path, right - .035 * width - bolt.right * boltScale, tip - bolt.bottom * boltScale, boltScale)
    };
  }
  // Clear sky has no cloud. Place both signals beside the sun or moon.
  const windScale = Math.min(.78, (left - 8) / wind.width);
  const boltScale = Math.min(.9, (size - right - 8) / bolt.width);
  return {
    precipitationTop,
    wind: layer(wind.path, left / 2 - wind.centerX * windScale, centerY - wind.centerY * windScale, windScale),
    bolt: layer(bolt.path, (size + right) / 2 - bolt.centerX * boltScale, centerY - bolt.centerY * boltScale, boltScale)
  };
}

const cloudyLayouts = cloudBounds.map(bounds => layout(bounds, true));
const clearDay = layout(clearDayBounds, false);
const clearNight = layout(clearNightBounds, false);
const freezingLayout = layout(freezingCloudBounds, true);
const unknownSky = { precipitationTop: 92, wind: layer(wind.path), bolt: layer(bolt.path) };

function precipitation({ rain, trace, snowLevel, mixed, freezing }, top) {
  if (freezing) {
    return layer('pictogrammes/calque-gouttes-verglas.svg', 0, top - freezingRainTop) +
      layer('pictogrammes/calque-route-glissante.svg', .325, top + freezingRainHeight + skidGap - 99.6);
  }

  const rainPath = 'pictogrammes/calque-pluie-' + rain + '.svg';
  const snowPath = 'pictogrammes/calque-neige-' + snowLevel + '.svg';
  if (mixed && rain) {
    const rainScale = .62;
    const snowScale = .68;
    const offset = top - Math.min(32 + rainTop * rainScale, 27 + snowTop * snowScale);
    return layer(rainPath, -4, 32 + offset, rainScale) + layer(snowPath, 45, 27 + offset, snowScale);
  }
  if (snowLevel) return layer(snowPath, 0, top - snowTop);
  if (trace) return layer('pictogrammes/calque-traces-pluie.svg', 0, top - traceTop);
  return rain ? layer(rainPath, 0, top - rainTop) : '';
}

export function forecastPictogramMarkup(options) {
  const { band, night, freezing, gusts, storm } = options;
  const selected = freezing ? freezingLayout : band > 0 ? cloudyLayouts[band - 1]
    : band === 0 ? (night ? clearNight : clearDay) : unknownSky;
  const sky = freezing ? layer('pictogrammes/calque-nuage-verglas.svg', 0, 8)
    : band >= 0 ? layer('vendor/weather-variants/cloud-' + (night ? 'night' : 'day') + '-' + band + '.svg', 0, -14) : '';
  const contents = sky + precipitation(options, selected.precipitationTop) +
    (storm ? selected.bolt : '') + (gusts ? selected.wind : '');
  return contents ? '<svg class="weather-pictogram" viewBox="0 0 128 136" aria-hidden="true">' + contents + '</svg>' : '';
}
