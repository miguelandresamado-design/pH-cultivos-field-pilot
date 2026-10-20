const SERIES = ["#17663a", "#397eb7", "#a9783f"];

function escapeXML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function lineChart(series, campaigns) {
  const width = 360, height = 245, left = 42, right = 342, top = 24, bottom = 190;
  const all = series.flatMap(item => item.values.map(point => point.value)).filter(Number.isFinite);
  const min = Math.min(4.5, ...all) - 0.1;
  const max = Math.max(6.5, ...all) + 0.1;
  const x = index => left + index * ((right - left) / Math.max(1, campaigns.length - 1));
  const y = value => bottom - ((value - min) / (max - min)) * (bottom - top);
  const ticks = [min, min + (max - min) / 3, min + 2 * (max - min) / 3, max];
  const grid = ticks.map(value => `<line class="chart-grid" x1="${left}" y1="${y(value).toFixed(1)}" x2="${right}" y2="${y(value).toFixed(1)}"/><text class="chart-axis" x="5" y="${(y(value) + 4).toFixed(1)}">${value.toFixed(1)}</text>`).join("");
  const xLabels = campaigns.map((campaign, index) => `<text class="chart-axis" text-anchor="middle" x="${x(index)}" y="218">${escapeXML(campaign.name.split(" ")[0].slice(0,3))}</text>`).join("");
  const paths = series.map((item, seriesIndex) => {
    let path = "", active = false;
    item.values.forEach((point, index) => {
      if (!Number.isFinite(point.value)) { active = false; return; }
      path += `${active ? " L" : " M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`;
      active = true;
    });
    const color = SERIES[seriesIndex];
    const points = item.values.map((point, index) => Number.isFinite(point.value) ? `<circle cx="${x(index)}" cy="${y(point.value).toFixed(1)}" r="5" fill="var(--surface)" stroke="${color}" stroke-width="3"><title>${escapeXML(item.name)}: ${point.value.toFixed(2)} pH · ${escapeXML(campaigns[index].name)}</title></circle>` : "").join("");
    return `<path d="${path.trim()}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join("");
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparación temporal de pH por lote">${grid}${xLabels}${paths}</svg>`;
}

export { escapeXML };

export function seriesColor(index) { return SERIES[index % SERIES.length]; }

export function trendText(values) {
  const valid = values.map(item => item.value).filter(Number.isFinite);
  if (valid.length < 2) return "No hay suficientes jornadas para establecer una tendencia.";
  const change = valid.at(-1) - valid[0];
  if (change >= 0.25) return `Tendencia ascendente: aumentó ${change.toFixed(2)} unidades en el periodo observado.`;
  if (change <= -0.25) return `Tendencia descendente: disminuyó ${Math.abs(change).toFixed(2)} unidades en el periodo observado.`;
  return `Comportamiento relativamente estable: variación de ${Math.abs(change).toFixed(2)} unidades.`;
}

export function heatPlot(points) {
  if (!points.length) return `<div class="empty-state">No hay puntos con ubicación para esta jornada.</div>`;
  const located = points.filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (located.length < 3) return `<div class="empty-state">Se necesitan al menos 3 puntos con GPS para representar la distribución.</div>`;
  const latitudes = located.map(point => point.latitude), longitudes = located.map(point => point.longitude);
  const latMin = Math.min(...latitudes), latMax = Math.max(...latitudes), lonMin = Math.min(...longitudes), lonMax = Math.max(...longitudes);
  const spreadLat = latMax - latMin || 0.001, spreadLon = lonMax - lonMin || 0.001;
  const position = point => ({
    x: 9 + ((point.longitude - lonMin) / spreadLon) * 82,
    y: 91 - ((point.latitude - latMin) / spreadLat) * 82
  });
  const tone = value => value < 5 ? "#c74635" : value < 5.5 ? "#e3bd48" : value <= 6.5 ? "#4d965f" : "#397eb7";
  const heat = located.map(point => { const pos = position(point); return `<i class="heat-spot" style="left:${pos.x}%;top:${pos.y}%;background:${tone(point.ph)}"></i>`; }).join("");
  const marks = located.map(point => { const pos = position(point); return `<button class="map-point" type="button" style="left:${pos.x}%;top:${pos.y}%" aria-label="Punto ${point.sample_number}, pH ${point.ph.toFixed(2)}"><span>${point.sample_number}</span></button>`; }).join("");
  return `<div class="heat-map" role="img" aria-label="Distribución espacial local de ${located.length} mediciones">${heat}${marks}</div>`;
}
