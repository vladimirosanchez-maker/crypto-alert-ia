let periodoActual = "15m";
let activoActual = "BTCUSDT";
let primeraCarga = true;
let ultimoTiempoDisponible = 0;
let guardadoPendiente = null;
let sincronizandoEscalas = false;
let versionContexto = 0;
let indicadorExpandido = null;
let detenerStreamingVelas = null;
let recalculoTiempoRealPendiente = null;
let consultandoVelaHistorica = false;
let sincronizandoCursor = false;
let repintadoHistogramaPendiente = null;

const historialesEnMemoria = new Map();
const descargasHistoricas = new Map();
const ultimosPreciosMercado = new Map();
const lineasAlertas = new Map();
const valoresCursor = { velas: new Map(), sqz: new Map(), adx: new Map(), rsi: new Map() };
const lienzoHistogramaSQZ = document.getElementById("histogramaPlanoSQZ");
const panelADX = document.getElementById("panelADX");
let datosHistogramaPlano = [];
const estadoGuardado = WORKSPACE.cargar();
const configuracionIndicadores = {
  rsi: { ...CONFIG.RSI, ...estadoGuardado?.indicadores?.rsi },
  sqz: { ...CONFIG.SQZ, ...estadoGuardado?.indicadores?.sqz }
};
const estiloRSI = {
  mostrarRSI: true, colorRSI: "#f4df17",
  mostrarMedia: true, colorMedia: "#f1f5f9",
  mostrarSuperior: true, colorSuperior: "#73758a",
  mostrarMediaBanda: true, colorMediaBanda: "#657080",
  mostrarInferior: true, colorInferior: "#73758a",
  rellenoFondo: true, mostrarSobrecompra: true, mostrarSobreventa: true, colorSobrecompra: "#369b52", colorSobreventa: "#eb444e",
  ...estadoGuardado?.indicadores?.rsiEstilo
};
const alturasIndicadores = {
  adx: Math.max(110, estadoGuardado?.layout?.indicadores?.adx || LAYOUT.adx),
  rsi: Math.max(110, estadoGuardado?.layout?.indicadores?.rsi || LAYOUT.rsi)
};

if (estadoGuardado?.periodo) periodoActual = estadoGuardado.periodo;
if (CONFIG.MONEDAS.includes(estadoGuardado?.simbolo)) activoActual = estadoGuardado.simbolo;

const contenedorGrafica = document.getElementById("graficaPrincipal");
const dimensionesIniciales = obtenerDimensionesGraficas();
const grafica = LightweightCharts.createChart(contenedorGrafica, crearOpcionesGrafica(dimensionesIniciales.principal));
const formatoPrecio = { type: "custom", minMove: 0.01, formatter: formatearPrecio };
const velas = grafica.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", borderUpColor: "#26a69a", borderDownColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350", priceFormat: formatoPrecio });
const ema10 = grafica.addLineSeries({ color: "#42a5f5", lineWidth: 1, title: "", priceFormat: formatoPrecio, priceLineVisible: false });
const ema55 = grafica.addLineSeries({ color: "#f6c344", lineWidth: 1, title: "", priceFormat: formatoPrecio, priceLineVisible: false });
const ema200 = grafica.addLineSeries({ color: "#d5dbe4", lineWidth: 1, title: "", priceFormat: formatoPrecio, priceLineVisible: false });
const volumen = grafica.addHistogramSeries({ priceScaleId: "volume", priceFormat: { type: "volume" } });
const { graficaADX, histogramaTTM, lineaADX } = crearGraficaADX();
const { graficaRSI, rsi, senal, limiteInferior, limiteSuperior, lineasBanda } = crearGraficaRSI();

grafica.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

function obtenerDimensionesGraficas() {
  const principal = window.innerWidth <= 600 ? 360 : window.innerWidth <= 920 ? 440 : LAYOUT.grafica;
  return { principal, adx: alturasIndicadores.adx, rsi: alturasIndicadores.rsi };
}

function crearOpcionesGrafica(alto) {
  const lineaCursor = { color: "#d8e0e8aa", width: 1, style: LightweightCharts.LineStyle.Dotted };
  return { width: contenedorGrafica.clientWidth, height: alto, layout: { background: { color: "#0b0e11" }, textColor: "#8792a2", fontSize: 11, attributionLogo: false }, grid: { vertLines: { color: "#1c242e" }, horzLines: { color: "#1c242e" } }, rightPriceScale: { borderColor: "#26303c", minimumWidth: window.innerWidth <= 600 ? 58 : 78 }, timeScale: { borderColor: "#26303c", timeVisible: true, secondsVisible: false }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: lineaCursor, horzLine: lineaCursor } };
}

function claveVista(simbolo = activoActual, periodo = periodoActual) { return `${simbolo}:${periodo}`; }
function establecerEstado(texto) { document.getElementById("estadoConexion").textContent = texto; }
function formatearPrecio(valor) { return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function actualizarCabeceraVela(vela) {
  if (!vela?.time) return;
  const fecha = new Date(Number(vela.time) * 1000);
  document.getElementById("infoFecha").textContent = `Fecha: ${fecha.toLocaleDateString("es-CO")}`;
  document.getElementById("infoHora").textContent = fecha.toLocaleTimeString("es-CO", { hour12: false });
  document.getElementById("infoOpen").textContent = `O ${formatearPrecio(vela.open)}`;
  document.getElementById("infoHigh").textContent = `H ${formatearPrecio(vela.high)}`;
  document.getElementById("infoLow").textContent = `L ${formatearPrecio(vela.low)}`;
  document.getElementById("infoClose").textContent = `C ${formatearPrecio(vela.close)}`;
  const cambio = vela.open ? ((vela.close - vela.open) / vela.open) * 100 : 0;
  const etiquetaCambio = document.getElementById("infoCambio");
  etiquetaCambio.textContent = `${cambio > 0 ? "+" : ""}${cambio.toFixed(2)}%`;
  etiquetaCambio.classList.toggle("positivo", cambio > 0);
  etiquetaCambio.classList.toggle("negativo", cambio < 0);
}

function actualizarCabeceraConUltimaVela() {
  const ultima = historialesEnMemoria.get(claveVista())?.at(-1);
  if (!ultima) return;
  actualizarCabeceraVela({ time: Number(ultima[0]) / 1000, open: Number(ultima[1]), high: Number(ultima[2]), low: Number(ultima[3]), close: Number(ultima[4]) });
}

function sincronizarLineasAlertas(alertas = ALERTAS.obtener()) {
  lineasAlertas.forEach((linea) => velas.removePriceLine(linea));
  lineasAlertas.clear();
  alertas.filter((alerta) => alerta.activa && alerta.symbol === activoActual).forEach((alerta) => {
    const esAlcista = alerta.condicion === "above";
    const linea = velas.createPriceLine({
      price: alerta.precio,
      color: esAlcista ? "#0f6b4f" : "#ff9800",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: ""
    });
    lineasAlertas.set(alerta.id, linea);
  });
}

function obtenerSnapshotInicial(simbolo, periodo) {
  const clave = claveVista(simbolo, periodo);
  if (historialesEnMemoria.has(clave)) return Promise.resolve(historialesEnMemoria.get(clave));
  return consultarVelas(simbolo, periodo, CONFIG.LIMITE_HISTORIAL_POR_CONSULTA).then((datos) => {
    historialesEnMemoria.set(clave, datos);
    iniciarDescargaHistorica(simbolo, periodo);
    return datos;
  });
}

function iniciarDescargaHistorica(simbolo, periodo) {
  const clave = claveVista(simbolo, periodo);
  if (descargasHistoricas.has(clave)) return;
  const descarga = consultarVelasHistoricas(simbolo, periodo, {
    desde: obtenerInicioContextoAnalisis(periodo),
    alProgreso: ({ descargadas }) => { if (clave === claveVista()) establecerEstado(`Cargando historial: ${descargadas.toLocaleString("es-CO")} velas`); }
  }).then((datos) => {
    if (datos.length) historialesEnMemoria.set(clave, datos);
    descargasHistoricas.delete(clave);
    if (clave === claveVista()) { aplicarDatosGrafica(datos, false); establecerEstado("Binance conectado"); }
  }).catch((error) => {
    console.error("Historial parcial:", error);
    descargasHistoricas.delete(clave);
    if (clave === claveVista()) establecerEstado("Binance conectado - historial parcial");
  });
  descargasHistoricas.set(clave, descarga);
}

function obtenerRangoGuardado() { return WORKSPACE.cargar()?.vistas?.[claveVista()]?.rango || null; }
function segundosDelPeriodo() { return { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 }[periodoActual]; }
function normalizarRangoVisible(rango) {
  if (!rango || !ultimoTiempoDisponible) return rango;
  const limiteDerecho = ultimoTiempoDisponible + segundosDelPeriodo() * 3;
  if (rango.to <= limiteDerecho) return rango;
  const exceso = rango.to - limiteDerecho;
  return { from: rango.from - exceso, to: limiteDerecho };
}

function guardarVista() {
  const rango = normalizarRangoVisible(grafica.timeScale().getVisibleRange());
  const rangoLogico = grafica.timeScale().getVisibleLogicalRange();
  if (!rango) return;
  const workspace = WORKSPACE.cargar() || {};
  WORKSPACE.guardar({ ...workspace, simbolo: activoActual, periodo: periodoActual, vistas: { ...workspace.vistas, [claveVista()]: { rango, rangoLogico } }, layout: { ...workspace.layout, indicadores: { ...alturasIndicadores } }, indicadores: { ...configuracionIndicadores, rsiEstilo: estiloRSI } });
}
function programarGuardadoVista() { clearTimeout(guardadoPendiente); guardadoPendiente = setTimeout(guardarVista, 350); }
function completarSerieConEspacios(velasBase, serie) { const valores = new Map(serie.map((punto) => [punto.time, punto])); return velasBase.map((vela) => valores.get(vela.time) || { time: vela.time }); }
function completarHistogramaContinuo(velasBase, serie) {
  const valores = new Map(serie.map((punto) => [punto.time, punto]));
  return velasBase.map((vela) => valores.get(vela.time) || { time: vela.time, value: 0, color: "rgba(0,0,0,0)" });
}

function programarDibujoHistogramaPlano() {
  if (repintadoHistogramaPendiente) return;
  repintadoHistogramaPendiente = requestAnimationFrame(() => {
    repintadoHistogramaPendiente = null;
    dibujarHistogramaPlano();
  });
}

function dibujarHistogramaPlano() {
  if (!lienzoHistogramaSQZ || !datosHistogramaPlano.length) return;
  const ancho = panelADX.clientWidth;
  const alto = graficaADX.paneSize().height;
  const densidad = window.devicePixelRatio || 1;
  if (lienzoHistogramaSQZ.width !== Math.round(ancho * densidad) || lienzoHistogramaSQZ.height !== Math.round(alto * densidad)) {
    lienzoHistogramaSQZ.width = Math.round(ancho * densidad);
    lienzoHistogramaSQZ.height = Math.round(alto * densidad);
  }
  lienzoHistogramaSQZ.style.height = `${alto}px`;
  const contexto = lienzoHistogramaSQZ.getContext("2d");
  contexto.setTransform(densidad, 0, 0, densidad, 0, 0);
  contexto.clearRect(0, 0, ancho, alto);
  const rango = graficaADX.timeScale().getVisibleLogicalRange();
  const base = histogramaTTM.priceToCoordinate(0);
  if (!rango || base === null) return;
  const desde = Math.max(0, Math.floor(rango.from) - 2);
  const hasta = Math.min(datosHistogramaPlano.length - 1, Math.ceil(rango.to) + 2);
  const coordenada = (indice) => graficaADX.timeScale().timeToCoordinate(datosHistogramaPlano[indice]?.time);
  for (let indice = desde; indice <= hasta; indice += 1) {
    const barra = datosHistogramaPlano[indice];
    if (!barra?.color || barra.color === "rgba(0,0,0,0)") continue;
    const x = coordenada(indice);
    const anterior = coordenada(Math.max(0, indice - 1));
    const siguiente = coordenada(Math.min(datosHistogramaPlano.length - 1, indice + 1));
    const y = histogramaTTM.priceToCoordinate(barra.value);
    if (x === null || anterior === null || siguiente === null || y === null) continue;
    const izquierda = Math.floor((anterior + x) / 2);
    const derecha = Math.ceil((x + siguiente) / 2);
    contexto.fillStyle = barra.color;
    contexto.fillRect(izquierda, Math.min(base, y), Math.max(1, derecha - izquierda), Math.abs(base - y));
  }
}

function cargarValoresCursor(destino, serie, propiedad) {
  valoresCursor[destino] = new Map(serie.map((punto) => [punto.time, Number(punto[propiedad])]).filter(([, valor]) => Number.isFinite(valor)));
}

function actualizarAnalisis(velasFormateadas, datosEMA, datosSQZ, datosRSI) {
  const analisis = obtenerAnalisisTemporal(velasFormateadas, {
    ema10: datosEMA[0].ultimo,
    ema55: datosEMA[1].ultimo,
    ema200: datosEMA[2].ultimo,
    rsi: datosRSI,
    sqz: datosSQZ,
    ajustesSQZ: configuracionIndicadores.sqz,
    temporalidad: periodoActual
  });
  const estado = document.getElementById("estadoIA");
  estado.textContent = analisis.estado;
  estado.style.color = analisis.color;
  document.getElementById("scoreIA").textContent = `${analisis.score}/100`;
  document.getElementById("analisisTemporal").textContent = analisis.resumen;
  document.getElementById("analisisModelo").textContent = analisis.modelo;
  document.getElementById("nivelesTecnicos").textContent = analisis.nivelesTecnicos;
  document.getElementById("factibilidadSubida").textContent = `${analisis.probabilidadAlcista}%`;
  document.getElementById("factibilidadCaida").textContent = `${analisis.probabilidadBajista}%`;
  document.getElementById("barraSubida").style.setProperty("--valor", `${analisis.probabilidadAlcista}%`);
  document.getElementById("barraCaida").style.setProperty("--valor", `${analisis.probabilidadBajista}%`);
  document.getElementById("condicionTemporal").textContent = `Confianza ${analisis.confianza}. ${analisis.condicion}`;
}

function restaurarVistaInicial(datos) {
  const rango = normalizarRangoVisible(obtenerRangoGuardado());
  const primero = datos[0][0] / 1000;
  const ultimo = datos.at(-1)[0] / 1000;
  if (rango && rango.from > 100000000 && rango.from <= ultimo && rango.to >= primero) grafica.timeScale().setVisibleRange(rango);
  else grafica.timeScale().fitContent();
  primeraCarga = false;
}

function aplicarDatosGrafica(datos, restaurarVista, conservarPosicionLogica = false) {
  if (!datos?.length) return;
  const rangoAnterior = restaurarVista ? null : conservarPosicionLogica ? grafica.timeScale().getVisibleLogicalRange() : grafica.timeScale().getVisibleRange();
  const velasFormateadas = datos.map(([time, open, high, low, close, volume]) => ({ time: Number(time) / 1000, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) }));
  ultimoTiempoDisponible = velasFormateadas.at(-1).time;
  velas.setData(velasFormateadas);
  volumen.setData(datos.map(([time, open, , , close, value]) => ({ time: Number(time) / 1000, value: Number(value), color: Number(close) >= Number(open) ? "#26a69a99" : "#ef535099" })));
  const datosEMA = [calcularEMA(velasFormateadas, 10), calcularEMA(velasFormateadas, 55), calcularEMA(velasFormateadas, 200)];
  ema10.setData(datosEMA[0].serie); ema55.setData(datosEMA[1].serie); ema200.setData(datosEMA[2].serie);
  const datosSQZ = calcularSQZADXTTM(velasFormateadas, configuracionIndicadores.sqz);
  const histogramaContinuo = completarHistogramaContinuo(velasFormateadas, datosSQZ.histograma);
  datosHistogramaPlano = histogramaContinuo;
  histogramaTTM.setData(histogramaContinuo.map((barra) => ({ ...barra, color: "rgba(0,0,0,0)" })));
  lineaADX.setData(completarSerieConEspacios(velasFormateadas, datosSQZ.lineaADX));
  const datosRSI = calcularRSI(velasFormateadas, configuracionIndicadores.rsi.periodo);
  rsi.setData(completarSerieConEspacios(velasFormateadas, datosRSI));
  senal.setData(completarSerieConEspacios(velasFormateadas, calcularMediaRSI(datosRSI, configuracionIndicadores.rsi.periodoSuavizado)));
  limiteInferior.setData(velasFormateadas.map((vela) => ({ time: vela.time, value: 0 })));
  limiteSuperior.setData(velasFormateadas.map((vela) => ({ time: vela.time, value: 100 })));
  cargarValoresCursor("velas", velasFormateadas, "close");
  cargarValoresCursor("sqz", histogramaContinuo, "value");
  cargarValoresCursor("adx", datosSQZ.lineaADX, "value");
  cargarValoresCursor("rsi", datosRSI, "value");
  programarDibujoHistogramaPlano();
  actualizarPresentacionIndicadores();
  actualizarAnalisis(velasFormateadas, datosEMA, datosSQZ, datosRSI);
  if (!consultandoVelaHistorica) actualizarCabeceraVela(velasFormateadas.at(-1));
  if (restaurarVista) restaurarVistaInicial(datos);
  else if (rangoAnterior) {
    if (conservarPosicionLogica) grafica.timeScale().setVisibleLogicalRange(rangoAnterior);
    else grafica.timeScale().setVisibleRange(rangoAnterior);
  }
  sincronizarADXConGrafica();
}

async function cargarVelas() {
  const contexto = ++versionContexto;
  const simbolo = activoActual;
  const periodo = periodoActual;
  establecerEstado("Cargando velas recientes");
  try {
    const datos = await obtenerSnapshotInicial(simbolo, periodo);
    if (contexto !== versionContexto) return;
    aplicarDatosGrafica(datos, primeraCarga);
    iniciarStreamingVelas(simbolo, periodo);
  } catch (error) { console.error("No fue posible mostrar la grafica:", error); establecerEstado("Error al cargar Binance"); }
}

function iniciarStreamingVelas(simbolo, periodo) {
  detenerStreamingVelas?.();
  detenerStreamingVelas = suscribirVelasEnTiempoReal(simbolo, periodo, (vela) => {
    if (simbolo !== activoActual || periodo !== periodoActual) return;
    actualizarVelaTiempoReal(vela);
  }, (estado) => {
    if (estado === "conectado") establecerEstado("Binance en tiempo real");
  });
}

function actualizarVelaTiempoReal(vela) {
  const clave = claveVista();
  const historial = historialesEnMemoria.get(clave);
  if (!historial) return;
  const cierre = Number(ultimosPreciosMercado.get(activoActual) ?? vela.c);
  const apertura = Number(vela.o);
  const maximo = Math.max(Number(vela.h), cierre);
  const minimo = Math.min(Number(vela.l), cierre);
  const nuevaVela = [Number(vela.t), vela.o, String(maximo), String(minimo), String(cierre), vela.v];
  const ultima = historial.at(-1);
  if (ultima?.[0] === nuevaVela[0]) historial[historial.length - 1] = nuevaVela;
  else historial.push(nuevaVela);
  const rangoLogico = grafica.timeScale().getVisibleLogicalRange();
  velas.update({ time: nuevaVela[0] / 1000, open: apertura, high: maximo, low: minimo, close: cierre });
  volumen.update({ time: nuevaVela[0] / 1000, value: Number(vela.v), color: cierre >= apertura ? "#26a69a99" : "#ef535099" });
  if (!consultandoVelaHistorica) actualizarCabeceraVela({ time: nuevaVela[0] / 1000, open: apertura, high: maximo, low: minimo, close: cierre });
  if (rangoLogico) grafica.timeScale().setVisibleLogicalRange(rangoLogico);
  sincronizarADXConGrafica();
  clearTimeout(recalculoTiempoRealPendiente);
  recalculoTiempoRealPendiente = setTimeout(() => aplicarDatosGrafica(historial, false, true), 250);
}

function actualizarPrecioActivoEnTiempoReal(precio) {
  const historial = historialesEnMemoria.get(claveVista());
  if (!historial?.length || !Number.isFinite(precio)) return;

  const ultima = historial.at(-1);
  const apertura = Number(ultima[1]);
  const maximo = Math.max(Number(ultima[2]), precio);
  const minimo = Math.min(Number(ultima[3]), precio);
  ultima[2] = String(maximo);
  ultima[3] = String(minimo);
  ultima[4] = String(precio);

  const rangoLogico = grafica.timeScale().getVisibleLogicalRange();
  velas.update({ time: Number(ultima[0]) / 1000, open: apertura, high: maximo, low: minimo, close: precio });
  if (!consultandoVelaHistorica) actualizarCabeceraVela({ time: Number(ultima[0]) / 1000, open: apertura, high: maximo, low: minimo, close: precio });
  if (rangoLogico) grafica.timeScale().setVisibleLogicalRange(rangoLogico);
  sincronizarADXConGrafica();
  clearTimeout(recalculoTiempoRealPendiente);
  recalculoTiempoRealPendiente = setTimeout(() => aplicarDatosGrafica(historial, false, true), 250);
}

window.addEventListener("precio-mercado", ({ detail }) => {
  if (!detail || !CONFIG.MONEDAS.includes(detail.symbol)) return;
  const precio = Number(detail.lastPrice);
  if (!Number.isFinite(precio)) return;
  ultimosPreciosMercado.set(detail.symbol, precio);
  if (detail.symbol === activoActual) actualizarPrecioActivoEnTiempoReal(precio);
});

async function actualizarUltimasVelas() {
  const clave = claveVista();
  const historial = historialesEnMemoria.get(clave);
  if (!historial) return;
  const recientes = await consultarVelas(activoActual, periodoActual, 3);
  if (!recientes.length || clave !== claveVista()) return;
  const primeraReciente = recientes[0][0];
  const combinado = [...historial.filter((vela) => vela[0] < primeraReciente), ...recientes];
  historialesEnMemoria.set(clave, combinado);
  aplicarDatosGrafica(combinado, false, true);
}

function actualizarControles() {
  document.querySelectorAll(".btnPeriodo").forEach((boton) => boton.classList.toggle("activo", boton.dataset.periodo === periodoActual));
  document.querySelectorAll(".itemCripto").forEach((item) => item.classList.toggle("itemActivo", item.dataset.symbol === activoActual));
  document.getElementById("activoTitulo").textContent = activoActual;
}
function restablecerEscalasDelActivo() {
  grafica.priceScale("right").applyOptions({ autoScale: true });
  graficaADX.priceScale("right").applyOptions({ autoScale: true });
  graficaRSI.priceScale("right").applyOptions({ autoScale: true });
}

function limpiarSeriesAlCambiarActivo() {
  velas.setData([]); volumen.setData([]); ema10.setData([]); ema55.setData([]); ema200.setData([]);
  histogramaTTM.setData([]); lineaADX.setData([]); rsi.setData([]); senal.setData([]);
  valoresCursor.velas.clear(); valoresCursor.sqz.clear(); valoresCursor.adx.clear(); valoresCursor.rsi.clear();
}

function cambiarActivo(simbolo) {
  if (!CONFIG.MONEDAS.includes(simbolo) || simbolo === activoActual) return;
  guardarVista();
  activoActual = simbolo;
  primeraCarga = true;
  consultandoVelaHistorica = false;
  limpiarSeriesAlCambiarActivo();
  restablecerEscalasDelActivo();
  actualizarControles();
  sincronizarLineasAlertas();
  cargarVelas();
}
function actualizarContador() {
  const restante = segundosDelPeriodo() - (Math.floor(Date.now() / 1000) % segundosDelPeriodo());
  const horas = Math.floor(restante / 3600);
  const minutos = Math.floor((restante % 3600) / 60);
  const segundos = restante % 60;
  document.getElementById("contadorVela").textContent = `Cierre ${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function sincronizarADXConGrafica() {
  const rango = grafica.timeScale().getVisibleLogicalRange();
  if (!rango) return;
  graficaADX.timeScale().setVisibleLogicalRange(rango);
  graficaRSI.timeScale().setVisibleLogicalRange(rango);
}

function sincronizarEscalas() {
  grafica.timeScale().subscribeVisibleLogicalRangeChange((rango) => {
    if (!rango || sincronizandoEscalas) return;
    sincronizandoEscalas = true;
    graficaADX.timeScale().setVisibleLogicalRange(rango);
    graficaRSI.timeScale().setVisibleLogicalRange(rango);
    sincronizandoEscalas = false;
    programarGuardadoVista();
  });
}
function redimensionarGraficas() {
  if (indicadorExpandido) {
    const panel = document.querySelector(`[data-panel-indicador="${indicadorExpandido}"]`);
    const alto = Math.max(280, window.innerHeight - 24);
    const ancho = panel.clientWidth;
    if (indicadorExpandido === "adx") { graficaADX.applyOptions({ width: ancho, height: alto }); programarDibujoHistogramaPlano(); }
    if (indicadorExpandido === "rsi") graficaRSI.applyOptions({ width: ancho, height: alto });
    return;
  }
  const dimensiones = obtenerDimensionesGraficas();
  const ancho = contenedorGrafica.clientWidth;
  grafica.applyOptions({ width: ancho, height: dimensiones.principal });
  graficaADX.applyOptions({ width: ancho, height: dimensiones.adx });
  graficaRSI.applyOptions({ width: ancho, height: dimensiones.rsi });
  programarDibujoHistogramaPlano();
}

function activarRedimensionadores() {
  document.querySelectorAll(".resize-indicador").forEach((control) => {
    control.addEventListener("pointerdown", (evento) => {
      if (indicadorExpandido) return;
      const indicador = control.dataset.indicador;
      const alturaInicial = alturasIndicadores[indicador];
      const inicioY = evento.clientY;
      control.setPointerCapture(evento.pointerId);
      const mover = (movimiento) => {
        alturasIndicadores[indicador] = Math.min(500, Math.max(110, alturaInicial + movimiento.clientY - inicioY));
        redimensionarGraficas();
      };
      const finalizar = () => {
        control.removeEventListener("pointermove", mover);
        guardarVista();
      };
      control.addEventListener("pointermove", mover);
      control.addEventListener("pointerup", finalizar, { once: true });
      control.addEventListener("pointercancel", finalizar, { once: true });
    });
  });
}

function activarControlesAlturaIndicadores() {
  document.querySelectorAll("[data-ajustar-indicador]").forEach((boton) => {
    boton.addEventListener("click", () => {
      if (indicadorExpandido) return;
      const indicador = boton.dataset.ajustarIndicador;
      const ajuste = Number(boton.dataset.ajuste);
      alturasIndicadores[indicador] = Math.min(500, Math.max(110, alturasIndicadores[indicador] + ajuste));
      redimensionarGraficas();
      guardarVista();
    });
  });
}

function alternarIndicadorExpandido(indicador) {
  const terminal = document.querySelector(".terminal");
  const paneles = document.querySelectorAll("[data-panel-indicador]");
  indicadorExpandido = indicadorExpandido === indicador ? null : indicador;
  terminal.classList.toggle("indicador-expandido", Boolean(indicadorExpandido));
  paneles.forEach((panel) => panel.classList.toggle("indicador-activo", panel.dataset.panelIndicador === indicadorExpandido));
  redimensionarGraficas();
}

function activarModoExpandido() {
  document.querySelectorAll("[data-panel-indicador]").forEach((panel) => {
    panel.addEventListener("dblclick", (evento) => {
      if (evento.target.closest(".resize-indicador, .controles-altura-indicador")) return;
      alternarIndicadorExpandido(panel.dataset.panelIndicador);
    });
  });
  window.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && indicadorExpandido) alternarIndicadorExpandido(indicadorExpandido);
  });
}

function actualizarPresentacionIndicadores() {
  const { rsi: ajusteRSI, sqz: ajusteSQZ } = configuracionIndicadores;
  document.getElementById("editarSQZ").textContent = `SQZ+ADX+TTM [R] ${ajusteSQZ.bbLength} ${ajusteSQZ.bbMultiplier} ${ajusteSQZ.kcLength} ${ajusteSQZ.kcMultiplier} ${ajusteSQZ.momentumLength} ${ajusteSQZ.adxLength} ${ajusteSQZ.keyLevel} ${ajusteSQZ.waveA} ${ajusteSQZ.waveB} ${ajusteSQZ.waveC}`;
  document.getElementById("editarRSI").textContent = `RSI ${ajusteRSI.periodo} ${ajusteRSI.suavizado} ${ajusteRSI.periodoSuavizado}`;
  rsi.applyOptions({ visible: estiloRSI.mostrarRSI, color: estiloRSI.colorRSI });
  senal.applyOptions({ visible: estiloRSI.mostrarMedia, color: estiloRSI.colorMedia });
  lineasBanda[0].applyOptions({ price: ajusteRSI.bandaInferior, color: estiloRSI.mostrarInferior ? estiloRSI.colorInferior : "rgba(0,0,0,0)" });
  lineasBanda[1].applyOptions({ price: ajusteRSI.bandaMedia, color: estiloRSI.mostrarMediaBanda ? estiloRSI.colorMediaBanda : "rgba(0,0,0,0)" });
  lineasBanda[2].applyOptions({ price: ajusteRSI.bandaSuperior, color: estiloRSI.mostrarSuperior ? estiloRSI.colorSuperior : "rgba(0,0,0,0)" });
  const panelRSI = document.getElementById("panelRSI");
  panelRSI.style.setProperty("--zona-superior", `${100 - ajusteRSI.bandaSuperior}%`);
  panelRSI.style.setProperty("--zona-inferior", `${100 - ajusteRSI.bandaInferior}%`);
  const sobrecompra = estiloRSI.mostrarSobrecompra ? estiloRSI.colorSobrecompra : "#0b0e11";
  const sobreventa = estiloRSI.mostrarSobreventa ? estiloRSI.colorSobreventa : "#0b0e11";
  panelRSI.style.background = estiloRSI.rellenoFondo ? `linear-gradient(to bottom, ${convertirColorConAlpha(sobrecompra, .16)} 0%, ${convertirColorConAlpha(sobrecompra, .06)} var(--zona-superior), rgba(27,32,48,.02) var(--zona-superior), rgba(27,32,48,.02) var(--zona-inferior), ${convertirColorConAlpha(sobreventa, .06)} var(--zona-inferior), ${convertirColorConAlpha(sobreventa, .16)} 100%)` : "transparent";
}

function crearControlEstilo(nombre, etiqueta, activo, color) {
  return `<label class="campo-estilo-rsi"><input name="${nombre}" type="checkbox" ${activo ? "checked" : ""}><span>${etiqueta}</span><input name="${nombre.replace("Mostrar", "Color")}" type="color" value="${color}"></label>`;
}

function crearCamposEstiloRSI() {
  return `<fieldset class="grupo-estilo-rsi"><legend>Estilo</legend>
    ${crearControlEstilo("estiloMostrarRSI", "RSI", estiloRSI.mostrarRSI, estiloRSI.colorRSI)}
    ${crearControlEstilo("estiloMostrarMedia", "RSI-based MA", estiloRSI.mostrarMedia, estiloRSI.colorMedia)}
    ${crearControlEstilo("estiloMostrarSuperior", "RSI Upper Band", estiloRSI.mostrarSuperior, estiloRSI.colorSuperior)}
    ${crearControlEstilo("estiloMostrarMediaBanda", "RSI Middle Band", estiloRSI.mostrarMediaBanda, estiloRSI.colorMediaBanda)}
    ${crearControlEstilo("estiloMostrarInferior", "RSI Lower Band", estiloRSI.mostrarInferior, estiloRSI.colorInferior)}
    <label class="campo-estilo-rsi"><input name="estiloRellenoFondo" type="checkbox" ${estiloRSI.rellenoFondo ? "checked" : ""}><span>RSI Background Fill</span></label>
    ${crearControlEstilo("estiloMostrarSobrecompra", "Overbought Gradient Fill", estiloRSI.mostrarSobrecompra, estiloRSI.colorSobrecompra)}
    ${crearControlEstilo("estiloMostrarSobreventa", "Oversold Gradient Fill", estiloRSI.mostrarSobreventa, estiloRSI.colorSobreventa)}
  </fieldset>`;
}

function convertirColorConAlpha(color, alpha) {
  const hexadecimal = color.replace("#", "");
  const numero = Number.parseInt(hexadecimal, 16);
  return `rgba(${(numero >> 16) & 255}, ${(numero >> 8) & 255}, ${numero & 255}, ${alpha})`;
}

function abrirConfiguracionIndicador(tipo) {
  const dialogo = document.getElementById("dialogoIndicador");
  const titulo = document.getElementById("tituloDialogo");
  const campos = document.getElementById("camposIndicador");
  const ajuste = configuracionIndicadores[tipo];
  const definiciones = tipo === "rsi"
    ? [["periodo", "Longitud RSI", 2, 100], ["periodoSuavizado", "Longitud SMA", 1, 100], ["bandaSuperior", "Banda superior", 51, 99], ["bandaMedia", "Banda media", 1, 99], ["bandaInferior", "Banda inferior", 1, 49]]
    : [["bbLength", "Longitud Bollinger", 2, 100], ["bbMultiplier", "Multiplicador Bollinger", 0.1, 10, 0.1], ["kcLength", "Longitud Keltner", 2, 100], ["kcMultiplier", "Multiplicador Keltner", 0.1, 10, 0.1], ["momentumLength", "Longitud Momentum", 2, 100], ["diLength", "Longitud DI", 2, 100], ["adxLength", "Longitud ADX", 2, 100], ["keyLevel", "Nivel clave ADX", 1, 100], ["scale", "Escala ADX", 1, 200], ["scaleADX", "Multiplicador ADX", 0.1, 10, 0.1], ["waveA", "Wave A", 1, 500], ["waveB", "Wave B", 1, 500], ["waveC", "Wave C", 1, 500]];
  titulo.textContent = tipo === "rsi" ? "RSI" : "SQZ+ADX+TTM";
  campos.innerHTML = definiciones.map(([nombre, etiqueta, minimo, maximo, paso = 1]) => `<label class="campo-indicador"><span>${etiqueta}</span><input name="${nombre}" type="number" min="${minimo}" max="${maximo}" step="${paso}" value="${ajuste[nombre]}"></label>`).join("");
  if (tipo === "rsi") {
    campos.insertAdjacentHTML("beforeend", '<div class="campo-indicador"><span>Tipo de suavizado</span><input value="SMA" disabled></div>');
    campos.insertAdjacentHTML("beforeend", crearCamposEstiloRSI());
  }
  dialogo.dataset.indicador = tipo;
  dialogo.showModal();
}

function activarConfiguracionIndicadores() {
  const dialogo = document.getElementById("dialogoIndicador");
  const formulario = document.getElementById("formularioIndicador");
  document.getElementById("editarSQZ").addEventListener("click", (evento) => { evento.stopPropagation(); abrirConfiguracionIndicador("sqz"); });
  document.getElementById("editarRSI").addEventListener("click", (evento) => { evento.stopPropagation(); abrirConfiguracionIndicador("rsi"); });
  document.getElementById("cerrarDialogo").addEventListener("click", () => dialogo.close());
  document.getElementById("cancelarIndicador").addEventListener("click", () => dialogo.close());
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const tipo = dialogo.dataset.indicador;
    const formularioDatos = new FormData(formulario);
    const siguiente = Object.fromEntries(formularioDatos.entries());
    Object.entries(siguiente).forEach(([nombre, valor]) => {
      if (!nombre.startsWith("estilo")) configuracionIndicadores[tipo][nombre] = Number(valor);
    });
    if (tipo === "rsi") {
      const ajuste = configuracionIndicadores.rsi;
      if (!(ajuste.bandaInferior < ajuste.bandaMedia && ajuste.bandaMedia < ajuste.bandaSuperior)) return;
      estiloRSI.mostrarRSI = formularioDatos.has("estiloMostrarRSI");
      estiloRSI.colorRSI = siguiente.estiloColorRSI;
      estiloRSI.mostrarMedia = formularioDatos.has("estiloMostrarMedia");
      estiloRSI.colorMedia = siguiente.estiloColorMedia;
      estiloRSI.mostrarSuperior = formularioDatos.has("estiloMostrarSuperior");
      estiloRSI.colorSuperior = siguiente.estiloColorSuperior;
      estiloRSI.mostrarMediaBanda = formularioDatos.has("estiloMostrarMediaBanda");
      estiloRSI.colorMediaBanda = siguiente.estiloColorMediaBanda;
      estiloRSI.mostrarInferior = formularioDatos.has("estiloMostrarInferior");
      estiloRSI.colorInferior = siguiente.estiloColorInferior;
      estiloRSI.rellenoFondo = formularioDatos.has("estiloRellenoFondo");
      estiloRSI.mostrarSobrecompra = formularioDatos.has("estiloMostrarSobrecompra");
      estiloRSI.mostrarSobreventa = formularioDatos.has("estiloMostrarSobreventa");
      estiloRSI.colorSobrecompra = siguiente.estiloColorSobrecompra;
      estiloRSI.colorSobreventa = siguiente.estiloColorSobreventa;
    }
    const datos = historialesEnMemoria.get(claveVista());
    if (datos) aplicarDatosGrafica(datos, false, true);
    actualizarPresentacionIndicadores();
    guardarVista();
    dialogo.close();
  });
}

grafica.subscribeCrosshairMove((param) => {
  const vela = param.seriesData?.get(velas);
  if (!vela || !param.time) {
    consultandoVelaHistorica = false;
    actualizarCabeceraConUltimaVela();
    return;
  }
  consultandoVelaHistorica = true;
  actualizarCabeceraVela({ time: param.time, open: vela.open, high: vela.high, low: vela.low, close: vela.close });
});

function valorCursor(destino, tiempo) {
  const valor = valoresCursor[destino].get(Number(tiempo));
  return Number.isFinite(valor) ? valor : null;
}

function moverCursorSincronizado(origen, param) {
  if (sincronizandoCursor) return;
  sincronizandoCursor = true;
  const graficas = [
    { nombre: "velas", grafica, serie: velas },
    { nombre: "sqz", grafica: graficaADX, serie: histogramaTTM, alternativa: lineaADX },
    { nombre: "rsi", grafica: graficaRSI, serie: rsi }
  ];
  try {
    if (!param?.time) {
      graficas.filter((destino) => destino.nombre !== origen).forEach((destino) => destino.grafica.clearCrosshairPosition());
      return;
    }
    graficas.filter((destino) => destino.nombre !== origen).forEach((destino) => {
      const valor = valorCursor(destino.nombre, param.time) ?? (destino.nombre === "sqz" ? valorCursor("adx", param.time) : null);
      if (valor === null) destino.grafica.clearCrosshairPosition();
      else destino.grafica.setCrosshairPosition(valor, param.time, destino.serie);
    });
  } finally {
    sincronizandoCursor = false;
  }
}

grafica.subscribeCrosshairMove((param) => moverCursorSincronizado("velas", param));
graficaADX.subscribeCrosshairMove((param) => { moverCursorSincronizado("sqz", param); programarDibujoHistogramaPlano(); });
graficaRSI.subscribeCrosshairMove((param) => moverCursorSincronizado("rsi", param));

document.querySelectorAll(".btnPeriodo").forEach((boton) => boton.addEventListener("click", () => { guardarVista(); periodoActual = boton.dataset.periodo; primeraCarga = true; actualizarControles(); cargarVelas(); }));
document.getElementById("guardarVista").addEventListener("click", () => { guardarVista(); establecerEstado("Vista guardada"); });
document.getElementById("irVelaActual").addEventListener("click", () => {
  grafica.timeScale().scrollToRealTime();
  sincronizarADXConGrafica();
  programarGuardadoVista();
});
window.addEventListener("resize", redimensionarGraficas);
sincronizarEscalas();
graficaADX.timeScale().subscribeVisibleLogicalRangeChange(programarDibujoHistogramaPlano);
panelADX.addEventListener("wheel", programarDibujoHistogramaPlano, { passive: true });
panelADX.addEventListener("pointerup", programarDibujoHistogramaPlano);
activarRedimensionadores();
activarControlesAlturaIndicadores();
activarModoExpandido();
activarConfiguracionIndicadores();
actualizarControles();
actualizarPresentacionIndicadores();
sincronizarLineasAlertas();
window.addEventListener("alertas-cambiadas", ({ detail }) => sincronizarLineasAlertas(detail?.alertas));
redimensionarGraficas();
cargarVelas();
actualizarContador();
setInterval(actualizarUltimasVelas, CONFIG.INTERVALO_GRAFICA);
setInterval(actualizarContador, 1000);
