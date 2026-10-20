const DEFAULT_POLL_INTERVAL_MS = 2000;

export function decodeYinmikFrame(input) {
  const bytes = input instanceof DataView
    ? Array.from({ length: input.byteLength }, (_, index) => input.getUint8(index))
    : Array.from(input || []);
  for (let index = bytes.length - 1; index > 0; index -= 1) {
    const current = bytes[index];
    const previous = bytes[index - 1];
    const highCurrent = (current & 0x55) << 1;
    const lowCurrent = (current & 0xaa) >> 1;
    const highPrevious = (previous & 0x55) << 1;
    const lowPrevious = (previous & 0xaa) >> 1;
    bytes[index] = 0xff - (highCurrent | lowPrevious);
    bytes[index - 1] = 0xff - (highPrevious | lowCurrent);
  }
  return bytes;
}

function unsigned16(bytes, index) { return (bytes[index] << 8) | bytes[index + 1]; }
function signed16(bytes, index) {
  const value = unsigned16(bytes, index);
  return value & 0x8000 ? value - 0x10000 : value;
}
function rawHex(value) {
  return Array.from({ length: value.byteLength }, (_, index) => value.getUint8(index).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function decodeYinmikReading(value) {
  if (!(value instanceof DataView) || value.byteLength !== 45) return null;
  const decoded = decodeYinmikFrame(value);
  if (decoded[0] !== 0x01 || decoded[1] !== 0x02) return null;
  const ph = unsigned16(decoded, 3) / 10;
  const temperatureC = signed16(decoded, 13) / 10;
  if (!Number.isFinite(ph) || ph < 0 || ph > 14 || !Number.isFinite(temperatureC) || temperatureC < -20 || temperatureC > 80) return null;
  return { ph, temperatureC, rawPayload: rawHex(value) };
}

export class YKS01Adapter {
  constructor(config = {}) {
    this.config = { pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, ...config };
    this.device = null;
    this.characteristic = null;
    this.pollTimer = null;
    this.readPending = false;
    this.connecting = false;
    this.handlers = { onReading: null, onStatus: null, onConnectionChange: null };
    this.handleNotification = event => this.receive(event.target.value);
    this.handleDisconnected = () => {
      this.stopPolling();
      this.characteristic = null;
      this.emitConnection(false);
      this.emitStatus("El medidor se desconectó.");
    };
  }

  setHandlers(handlers = {}) { this.handlers = { ...this.handlers, ...handlers }; }
  supportsWebBluetooth() { return Boolean(globalThis.navigator && "bluetooth" in globalThis.navigator); }
  canConnectReal() { return Boolean(this.config.serviceUuid && this.config.characteristicUuid); }
  isConnected() { return Boolean(this.device?.gatt?.connected && this.characteristic); }
  isConnecting() { return this.connecting; }
  emitStatus(message) { this.handlers.onStatus?.(message); }
  emitConnection(connected) { this.handlers.onConnectionChange?.(connected); }

  receive(value) {
    const reading = decodeYinmikReading(value);
    if (!reading) {
      this.emitStatus("Se recibió un paquete que no pudo interpretarse.");
      return null;
    }
    this.handlers.onReading?.({
      ...reading,
      source: "bluetooth",
      device: {
        name: this.device?.name || "YK-S01",
        serviceUuid: this.config.serviceUuid,
        characteristicUuid: this.config.characteristicUuid
      }
    });
    this.emitStatus("Lectura recibida. Puedes guardarla cuando estés en la ubicación correcta.");
    return reading;
  }

  async connect() {
    if (!this.canConnectReal()) throw new Error("Faltan los identificadores Bluetooth validados del YK-S01.");
    if (!this.supportsWebBluetooth()) throw new Error("Bluetooth no está disponible en este navegador. En iPhone abre la aplicación dentro de Bluefy.");
    if (this.isConnected()) return this.device;
    if (this.connecting) return null;
    this.connecting = true;
    this.emitStatus("Selecciona YK-S01 en la ventana Bluetooth…");
    try {
      this.device = await globalThis.navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: this.config.namePrefix || "YK-S01" }],
        optionalServices: [this.config.serviceUuid]
      });
      this.device.addEventListener("gattserverdisconnected", this.handleDisconnected);
      this.emitStatus("Conectando con el medidor…");
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(this.config.serviceUuid);
      this.characteristic = await service.getCharacteristic(this.config.characteristicUuid);
      this.characteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
      await this.characteristic.startNotifications();
      this.connecting = false;
      this.emitConnection(true);
      this.emitStatus("Conectado. Esperando una lectura del medidor…");
      this.startPolling();
      return this.device;
    } catch (error) {
      this.connecting = false;
      this.stopPolling();
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      this.characteristic = null;
      this.emitConnection(false);
      if (error?.name === "NotFoundError") throw new Error("No se seleccionó ningún medidor.");
      throw new Error("No fue posible conectar. Verifica que el YK-S01 esté encendido, cerca y sin conexión a otra aplicación.");
    }
  }

  async readNow() {
    if (!this.characteristic || this.readPending) return null;
    this.readPending = true;
    try { return this.receive(await this.characteristic.readValue()); }
    catch (error) {
      if (this.isConnected()) this.emitStatus("Conectado. Esperando la siguiente lectura del medidor…");
      return null;
    } finally { this.readPending = false; }
  }

  startPolling() {
    this.stopPolling();
    if (!this.isConnected()) return;
    this.readNow();
    this.pollTimer = globalThis.setInterval(() => this.readNow(), this.config.pollIntervalMs);
  }

  stopPolling() {
    if (this.pollTimer !== null) globalThis.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  disconnect() {
    this.connecting = false;
    this.stopPolling();
    if (this.characteristic) this.characteristic.removeEventListener("characteristicvaluechanged", this.handleNotification);
    if (this.device) this.device.removeEventListener("gattserverdisconnected", this.handleDisconnected);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.characteristic = null;
    this.emitConnection(false);
    this.emitStatus("Medidor desconectado.");
  }
}
