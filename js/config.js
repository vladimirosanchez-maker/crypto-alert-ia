const CONFIG = Object.freeze({
  API_FUTURES: "https://fapi.binance.com",
  WS_FUTURES: "wss://fstream.binance.com",
  MONEDAS: ["BTCUSDT", "ETHUSDT"],
  INTERVALO_ACTUALIZACION: 5000,
  INTERVALO_GRAFICA: 30000,
  LIMITE_VELAS: 1000,
  HISTORIAL_DESDE: "2013-01-01T00:00:00.000Z",
  LIMITE_HISTORIAL_POR_CONSULTA: 1500,
  PAUSA_ENTRE_CONSULTAS_MS: 100,
  DIAS_CONTEXTO_ANALISIS: 62,
  VELAS_MINIMAS_ANALISIS: 233,
  RSI: Object.freeze({ periodo: 14, suavizado: "SMA", periodoSuavizado: 14, bandaSuperior: 70, bandaMedia: 50, bandaInferior: 30 }),
  SQZ: Object.freeze({ bbLength: 20, bbMultiplier: 2, kcLength: 20, kcMultiplier: 1.5, momentumLength: 20, diLength: 14, adxLength: 14, keyLevel: 23, scale: 75, scaleADX: 2, waveA: 55, waveB: 144, waveC: 233 })
});
