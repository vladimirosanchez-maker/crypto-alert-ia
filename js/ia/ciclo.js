const CICLOS_BTC = Object.freeze({
  halvingActual: Date.parse("2024-04-20T00:00:00Z"),
  siguienteHalvingEstimado: Date.parse("2028-04-01T00:00:00Z"),
  diasHalvingAPico: [367, 526, 548],
  diasPicoAFondo: [410, 364, 376]
});

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

function sumarDias(fecha, dias) { return new Date(fecha + dias * 86400000); }
function diasEntre(desde, hasta) { return Math.floor((hasta - desde) / 86400000); }
function fechaCorta(fecha) { return fecha.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
function precioCiclo(valor) { return Number(valor).toLocaleString("es-CO", { maximumFractionDigits: 0 }); }

function analizarCicloBitcoin(datos) {
  const velas = datos.map(([time, open, high, low, close, volume]) => ({ time: Number(time) / 1000, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) }));
  const desdeHalving = velas.filter((vela) => vela.time * 1000 >= CICLOS_BTC.halvingActual);
  if (desdeHalving.length < 200) return null;
  const ultima = velas.at(-1);
  const pico = desdeHalving.reduce((mayor, vela) => vela.high > mayor.high ? vela : mayor, desdeHalving[0]);
  const drawdown = ((ultima.close - pico.high) / pico.high) * 100;
  const ahoraDatos = ultima.time * 1000;
  const diasPostHalving = diasEntre(CICLOS_BTC.halvingActual, ahoraDatos);
  const diasPostPico = diasEntre(pico.time * 1000, ahoraDatos);
  const ema50 = calcularEMA(velas, 50).ultimo;
  const ema200 = calcularEMA(velas, 200).ultimo;
  const rsi = calcularRSI(velas, 14).at(-1)?.value;
  const dmi = calcularDMI(velas, 14, 14);
  const adx = ultimoFinito(dmi.adx);
  const plusDI = ultimoFinito(dmi.plusDI);
  const minusDI = ultimoFinito(dmi.minusDI);
  const tendenciaDiariaAlcista = ultima.close > ema200 && ema50 > ema200 && plusDI > minusDI;
  const tendenciaDiariaBajista = ultima.close < ema200 && ema50 < ema200 && minusDI > plusDI;
  const picoMediano = mediana(CICLOS_BTC.diasHalvingAPico);
  const fondoMediano = mediana(CICLOS_BTC.diasPicoAFondo);
  const fondoCentral = sumarDias(pico.time * 1000, fondoMediano);
  const fondoDesde = sumarDias(pico.time * 1000, Math.min(...CICLOS_BTC.diasPicoAFondo));
  const fondoHasta = sumarDias(pico.time * 1000, Math.max(...CICLOS_BTC.diasPicoAFondo));
  let fase = "Transición / rango";
  let color = "#d7a93e";
  if (tendenciaDiariaAlcista && drawdown > -20) { fase = "Estructura alcista"; color = "#26a69a"; }
  if (tendenciaDiariaBajista || drawdown <= -30) { fase = "Bear market / contracción"; color = "#ef5350"; }
  if (diasPostPico >= Math.min(...CICLOS_BTC.diasPicoAFondo) && !tendenciaDiariaBajista) { fase = "Zona histórica de fondo / acumulación"; color = "#71c7a7"; }
  const confirmacion = tendenciaDiariaAlcista ? "BTC diario confirma recuperación sobre EMA200 con EMA50 alcista" : tendenciaDiariaBajista ? "BTC diario confirma deterioro bajo EMA200 con DMI bajista" : "BTC diario aún no confirma una nueva tendencia estructural";
  return {
    fase, color,
    resumen: `${confirmacion}. RSI diario ${Number.isFinite(rsi) ? rsi.toFixed(1) : "--"}, ADX ${Number.isFinite(adx) ? adx.toFixed(1) : "--"}. Este contexto macro se aplica también al activo seleccionado.`,
    metricas: `${diasPostHalving} días desde halving · Pico observado ${fechaCorta(new Date(pico.time * 1000))} en ${precioCiclo(pico.high)} · Drawdown ${drawdown.toFixed(1)}% · ${Math.max(0, diasPostPico)} días desde pico`,
    ventana: `Bear estimado después del pico observado (${fechaCorta(new Date(pico.time * 1000))}) y confirmado al perder EMA200. Referencia histórica: pico mediano ~${picoMediano} días post-halving; posible fondo/acumulación ${fechaCorta(fondoDesde)}–${fechaCorta(fondoHasta)} (centro ${fechaCorta(fondoCentral)}). Un nuevo bull se confirma sólo con precio y EMA50 sobre EMA200 más DMI alcista. Próximo halving estimado: ${fechaCorta(new Date(CICLOS_BTC.siguienteHalvingEstimado))}.`
  };
}

async function actualizarCicloBitcoin() {
  const fase = document.getElementById("faseCicloBTC");
  try {
    const datos = await consultarContextoBitcoin();
    const analisis = analizarCicloBitcoin(datos);
    if (!analisis) throw new Error("Historial diario insuficiente");
    fase.textContent = analisis.fase;
    fase.style.color = analisis.color;
    document.getElementById("resumenCicloBTC").textContent = analisis.resumen;
    document.getElementById("metricasCicloBTC").textContent = analisis.metricas;
    document.getElementById("ventanaCicloBTC").textContent = analisis.ventana;
  } catch (error) {
    console.error("No fue posible actualizar el ciclo BTC:", error);
    fase.textContent = "Contexto no disponible";
    document.getElementById("resumenCicloBTC").textContent = "No se pudo consultar BTC diario; el análisis del activo continúa funcionando.";
  }
}

actualizarCicloBitcoin();
setInterval(actualizarCicloBitcoin, 3600000);
