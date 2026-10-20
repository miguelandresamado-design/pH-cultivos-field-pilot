let configPromise;

export function loadAgronomy() {
  if (!configPromise) {
    configPromise = fetch(new URL("../../../config/agronomy.json", import.meta.url)).then(response => {
      if (!response.ok) throw new Error("No fue posible cargar la configuración agronómica");
      return response.json();
    });
  }
  return configPromise;
}

export function interpretValue(value, crop, config) {
  if (!Number.isFinite(Number(value))) return { label: "Sin lectura", tone: "unknown", provisional: true };
  const cropConfig = config?.crops?.[crop];
  if (!cropConfig) return { label: "Sin rango configurado", tone: "unknown", provisional: true };
  const level = cropConfig.levels.find(item => Number(value) <= item.max) || cropConfig.levels.at(-1);
  return { ...level, provisional: Boolean(cropConfig.provisional), cropName: cropConfig.name };
}
