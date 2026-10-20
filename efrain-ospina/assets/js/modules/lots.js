export function activeLots(lots) {
  return lots.filter(lot => !lot.archived_at);
}

export function normalizeLotInput({ name, area_ha, planting_year }) {
  const normalizedName = String(name ?? "").trim().replace(/\s+/g, " ");
  const area = area_ha === "" || area_ha == null ? null : Number(area_ha);
  const year = planting_year === "" || planting_year == null ? null : Number(planting_year);
  return { name: normalizedName, area_ha: area, planting_year: year };
}

export function validateLotInput(input, lots, farmId, currentLotId = null, currentYear = new Date().getFullYear()) {
  if (!input.name) return "Escribe el nombre del lote.";
  if (input.name.length > 80) return "El nombre del lote no puede superar 80 caracteres.";
  if (input.area_ha !== null && (!Number.isFinite(input.area_ha) || input.area_ha <= 0 || input.area_ha > 10000)) return "El área debe ser mayor que cero.";
  if (input.planting_year !== null && (!Number.isInteger(input.planting_year) || input.planting_year < 1900 || input.planting_year > currentYear + 1)) return `El año de siembra debe estar entre 1900 y ${currentYear + 1}.`;
  const duplicate = lots.some(lot => lot.farm_id === farmId && lot.id !== currentLotId && lot.name.trim().toLocaleLowerCase("es") === input.name.toLocaleLowerCase("es"));
  if (duplicate) return "Ya existe un lote con ese nombre en la finca.";
  return "";
}
