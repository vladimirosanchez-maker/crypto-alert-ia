async function solicitarBinance(ruta) {
  const respuesta = await fetch(`${CONFIG.API_FUTURES}${ruta}`);
  if (!respuesta.ok) throw new Error(`Binance respondio ${respuesta.status}`);
  return respuesta.json();
}

async function consultarMoneda(simbolo) {
  try { return await solicitarBinance(`/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(simbolo)}`); }
  catch (error) { console.error("No fue posible consultar el ticker:", error); return null; }
}

async function consultarVelas(simbolo, intervalo, limite = CONFIG.LIMITE_VELAS) {
  try { return await solicitarBinance(`/fapi/v1/klines?symbol=${encodeURIComponent(simbolo)}&interval=${intervalo}&limit=${limite}`); }
  catch (error) { console.error("No fue posible consultar las velas:", error); return []; }
}

function milisegundosIntervalo(intervalo) {
  return { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000, "1w": 604800000 }[intervalo];
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
    if (lote.length < limite) break;
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
