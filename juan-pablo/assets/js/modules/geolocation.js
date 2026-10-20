export function requestPosition(options = {}) {
  const defaults = { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 };
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS no disponible en este dispositivo"));
    navigator.geolocation.getCurrentPosition(position => resolve({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp).toISOString()
    }), error => reject(new Error(error.code === 1 ? "Ubicación no autorizada" : "No fue posible obtener la ubicación")), { ...defaults, ...options });
  });
}
