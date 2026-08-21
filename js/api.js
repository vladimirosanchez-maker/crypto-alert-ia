async function solicitarBinance(ruta) {
  try {
    const respuesta = await fetch(`${CONFIG.API_FUTURES}${ruta}`);
    if (!respuesta.ok) throw new Error(`Binance Futures respondió ${respuesta.status}`);
    return respuesta.json();
  } catch (errorFutures) {
    const admiteRespaldo = ruta.startsWith("/fapi/v1/klines") || ruta.startsWith("/fapi/v1/ticker/24hr");
    if (!admiteRespaldo) throw errorFutures;
    // Algunas redes móviles bloquean Futures. Spot conserva el mismo esquema OHLCV.
    const rutaSpot = ruta.replace("/fapi/v1/", "/api/v3/").replace(/([?&]limit=)1500(?=&|$)/, (_, prefijo) => `${prefijo}1000`);
    const respuestaSpot = await fetch(`${CONFIG.API_SPOT_RESPALDO}${rutaSpot}`);
    if (!respuestaSpot.ok) throw new Error(`Respaldo Binance Spot respondió ${respuestaSpot.status}`);
    return respuestaSpot.json();
  }
}

async function consultarMoneda(simbolo) {
  try { return await solicitarBinance(`/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(simbolo)}`); }
  catch (error) { console.error("No fue posible consultar el ticker:", error); return null; }
}

async function consultarVelas(simbolo, intervalo, limite = CONFIG.LIMITE_VELAS) {
  try { return await solicitarBinance(`/fapi/v1/klines?symbol=${encodeURIComponent(simbolo)}&interval=${intervalo}&limit=${limite}`); }
  catch (error) { console.error("No fue posible consultar las velas:", error); return []; }
}

let contextoBitcoinDiario = null;
let consultaContextoBitcoin = null;

async function consultarContextoBitcoin() {
  const unaHora = 3600000;
  if (contextoBitcoinDiario && Date.now() - contextoBitcoinDiario.actualizado < unaHora) return contextoBitcoinDiario.velas;
  if (consultaContextoBitcoin) return consultaContextoBitcoin;
  consultaContextoBitcoin = consultarVelas("BTCUSDT", "1d", 1500).then((velas) => {
    if (velas.length) contextoBitcoinDiario = { actualizado: Date.now(), velas };
    consultaContextoBitcoin = null;
    return velas;
  }).catch((error) => { consultaContextoBitcoin = null; throw error; });
  return consultaContextoBitcoin;
}

function milisegundosIntervalo(intervalo) {
  return { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "2h": 7200000, "4h": 14400000, "6h": 21600000, "8h": 28800000, "12h": 43200000, "1d": 86400000, "3d": 259200000, "1w": 604800000, "1M": 2592000000 }[intervalo];
}

function obtenerInicioContextoAnalisis(intervalo) {
  const intervaloMs = milisegundosIntervalo(intervalo);
  const duracionIndicadores = CONFIG.VELAS_MINIMAS_ANALISIS * intervaloMs;
  const diasProyeccion = { "1m": 3, "3m": 7, "5m": 14, "15m": 30, "30m": 45, "1h": 60, "2h": 90, "4h": 120, "6h": 180, "8h": 240, "12h": 365, "1d": 730, "3d": 1460, "1w": 2555, "1M": 5000 }[intervalo] || CONFIG.DIAS_CONTEXTO_ANALISIS;
  return Date.now() - Math.max(duracionIndicadores, diasProyeccion * 86400000);
}

function esperar(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos));
}

async function consultarVelasHistoricas(simbolo, intervalo, opciones = {}) {
  const ahora = Date.now();
  const desde = opciones.desde ?? Date.parse(CONFIG.HISTORIAL_DESDE);
  const limite = CONFIG.LIMITE_HISTORIAL_POR_CONSULTA;
  const intervaloMs = milisegundosIntervalo(intervalo);
  const resultado = [];
  let cursor = desde;

  while (cursor < ahora) {
    if (opciones.cancelar?.()) return [];
    const ruta = `/fapi/v1/klines?symbol=${encodeURIComponent(simbolo)}&interval=${intervalo}&startTime=${cursor}&endTime=${ahora}&limit=${limite}`;
    let lote;
    try { lote = await solicitarBinance(ruta); }
    catch (error) { console.error("No fue posible descargar el historial:", error); break; }
    if (!lote.length) break;
    resultado.push(...lote.filter((vela) => !resultado.length || vela[0] > resultado.at(-1)[0]));
    cursor = Number(lote.at(-1)[0]) + intervaloMs;
    opciones.alProgreso?.({ descargadas: resultado.length, hasta: cursor, ahora });
    await esperar(CONFIG.PAUSA_ENTRE_CONSULTAS_MS);
  }
  return resultado;
}

function suscribirVelasEnTiempoReal(simbolo, intervalo, alActualizar, alEstado = () => {}) {
  let socket;
  let detenido = false;
  const conectar = () => {
    socket = new WebSocket(`${CONFIG.WS_FUTURES}/ws/${simbolo.toLowerCase()}@kline_${intervalo}`);
    socket.addEventListener("open", () => alEstado("conectado"));
    socket.addEventListener("message", (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.k) alActualizar(mensaje.k);
    });
    socket.addEventListener("error", () => alEstado("error"));
    socket.addEventListener("close", () => {
      if (!detenido) setTimeout(conectar, 2000);
    });
  };
  conectar();
  return () => { detenido = true; socket?.close(); };
}

function suscribirPreciosEnTiempoReal(simbolos, alActualizar) {
  const streams = simbolos.map((simbolo) => `${simbolo.toLowerCase()}@miniTicker`).join("/");
  let socket;
  let detenido = false;
  const conectar = () => {
    socket = new WebSocket(`${CONFIG.WS_FUTURES}/stream?streams=${streams}`);
    socket.addEventListener("message", (evento) => {
      const mensaje = JSON.parse(evento.data);
      const ticker = mensaje.data;
      if (ticker?.s && ticker?.c) alActualizar({ symbol: ticker.s, lastPrice: ticker.c });
    });
    socket.addEventListener("close", () => { if (!detenido) setTimeout(conectar, 2000); });
  };
  conectar();
  return () => { detenido = true; socket?.close(); };
}
