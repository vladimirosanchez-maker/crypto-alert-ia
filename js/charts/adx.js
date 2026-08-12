// SQZ/ADX formulas adapted from the user-provided Pine Script source (MPL-2.0).
// https://mozilla.org/MPL/2.0/
function crearGraficaADX() {
  const contenedor = document.getElementById("panelADX");
  const graficaADX = LightweightCharts.createChart(contenedor, {
    width: contenedor.clientWidth,
    height: LAYOUT.adx,
    layout: { background: { color: "#0b0e11" }, textColor: "#8792a2", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { color: "#1c242e" }, horzLines: { color: "#1c242e" } },
    rightPriceScale: { borderColor: "#26303c", minimumWidth: window.innerWidth <= 600 ? 58 : 78, scaleMargins: { top: 0.16, bottom: 0.1 } },
    timeScale: { borderColor: "#26303c", visible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: "#d8e0e8aa", width: 1, style: LightweightCharts.LineStyle.Dotted }, horzLine: { color: "#d8e0e8aa", width: 1, style: LightweightCharts.LineStyle.Dotted } },
    handleScroll: false,
    handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: true, axisDoubleClickReset: true }
  });
  const histogramaTTM = graficaADX.addHistogramSeries({ base: 0, priceFormat: { type: "price", precision: 2, minMove: 0.01 }, lastValueVisible: true });
  histogramaTTM.createPriceLine({ price: 0, color: "#c9d0d8", lineWidth: 1, axisLabelVisible: false });
  const lineaADX = graficaADX.addLineSeries({ color: "#f1f5f9", lineWidth: 2, title: "", priceLineVisible: false });
  return { graficaADX, histogramaTTM, lineaADX };
}

function calcularSQZADXTTM(velas, ajustes) {
  const cierres = velas.map((vela) => vela.close);
  const altos = velas.map((vela) => vela.high);
  const bajos = velas.map((vela) => vela.low);
  const baseBB = calcularSMA(cierres, ajustes.bbLength);
  const desviacion = calcularDesviacion(cierres, ajustes.bbLength);
  const baseKC = calcularSMA(cierres, ajustes.kcLength);
  const rangoVerdadero = calcularRangoVerdadero(velas);
  const rangoKC = calcularSMA(rangoVerdadero, ajustes.kcLength);
  const maximos = calcularMaximos(altos, ajustes.momentumLength);
  const minimos = calcularMinimos(bajos, ajustes.momentumLength);
  const mediaCierres = calcularSMA(cierres, ajustes.momentumLength);
  const fuenteMomentum = cierres.map((cierre, indice) => Number.isFinite(maximos[indice]) && Number.isFinite(mediaCierres[indice]) ? cierre - ((maximos[indice] + minimos[indice]) / 2 + mediaCierres[indice]) / 2 : NaN);
  const momentum = calcularRegresionLineal(fuenteMomentum, ajustes.momentumLength);
  const adx = calcularADXCrudo(velas, ajustes.diLength, ajustes.adxLength);
  const escala = Math.max(1, ...momentum.filter(Number.isFinite));

  const histograma = [];
  const lineaADX = [];
  momentum.forEach((valor, indice) => {
    if (!Number.isFinite(valor)) return;
    const anterior = momentum[indice - 1] ?? valor;
    const color = valor > 0 ? (valor > anterior ? "#2ef527" : "#10780d") : (valor < anterior ? "#d90606" : "#620000");
    histograma.push({ time: velas[indice].time, value: valor, color });
  });
  adx.forEach((valor, indice) => {
    if (!Number.isFinite(valor)) return;
    lineaADX.push({ time: velas[indice].time, value: (valor - ajustes.keyLevel) * escala / ajustes.scale * ajustes.scaleADX });
  });
  return { histograma, lineaADX };
}

function calcularSMA(valores, periodo) {
  const resultado = Array(valores.length).fill(NaN);
  let suma = 0;
  for (let indice = 0; indice < valores.length; indice += 1) {
    suma += valores[indice];
    if (indice >= periodo) suma -= valores[indice - periodo];
    if (indice >= periodo - 1) resultado[indice] = suma / periodo;
  }
  return resultado;
}

function calcularDesviacion(valores, periodo) {
  return valores.map((_, indice) => {
    if (indice < periodo - 1) return NaN;
    const media = valores.slice(indice - periodo + 1, indice + 1).reduce((suma, valor) => suma + valor, 0) / periodo;
    return Math.sqrt(valores.slice(indice - periodo + 1, indice + 1).reduce((suma, valor) => suma + (valor - media) ** 2, 0) / periodo);
  });
}

function calcularMaximos(valores, periodo) { return valores.map((_, indice) => indice < periodo - 1 ? NaN : Math.max(...valores.slice(indice - periodo + 1, indice + 1))); }
function calcularMinimos(valores, periodo) { return valores.map((_, indice) => indice < periodo - 1 ? NaN : Math.min(...valores.slice(indice - periodo + 1, indice + 1))); }

function calcularRangoVerdadero(velas) {
  return velas.map((vela, indice) => indice === 0 ? vela.high - vela.low : Math.max(vela.high - vela.low, Math.abs(vela.high - velas[indice - 1].close), Math.abs(vela.low - velas[indice - 1].close)));
}

function calcularRegresionLineal(valores, periodo) {
  return valores.map((_, indice) => {
    if (indice < periodo - 1 || valores.slice(indice - periodo + 1, indice + 1).some((valor) => !Number.isFinite(valor))) return NaN;
    const bloque = valores.slice(indice - periodo + 1, indice + 1);
    const mediaX = (periodo - 1) / 2;
    const mediaY = bloque.reduce((suma, valor) => suma + valor, 0) / periodo;
    const numerador = bloque.reduce((suma, valor, posicion) => suma + (posicion - mediaX) * (valor - mediaY), 0);
    const denominador = bloque.reduce((suma, _, posicion) => suma + (posicion - mediaX) ** 2, 0);
    return mediaY - (numerador / denominador) * mediaX + (numerador / denominador) * (periodo - 1);
  });
}

function calcularADXCrudo(velas, diLength, adxLength) {
  return calcularDMI(velas, diLength, adxLength).adx;
}

function calcularDMI(velas, diLength, adxLength) {
  const resultado = Array(velas.length).fill(NaN);
  const plusDI = Array(velas.length).fill(NaN);
  const minusDI = Array(velas.length).fill(NaN);
  if (velas.length < diLength + adxLength) return { adx: resultado, plusDI, minusDI };
  const tr = calcularRangoVerdadero(velas);
  const plusDM = Array(velas.length).fill(0);
  const minusDM = Array(velas.length).fill(0);
  for (let indice = 1; indice < velas.length; indice += 1) {
    const subida = velas[indice].high - velas[indice - 1].high;
    const bajada = velas[indice - 1].low - velas[indice].low;
    plusDM[indice] = subida > bajada && subida > 0 ? subida : 0;
    minusDM[indice] = bajada > subida && bajada > 0 ? bajada : 0;
  }
  let trSuavizado = tr.slice(1, diLength + 1).reduce((suma, valor) => suma + valor, 0);
  let plusSuavizado = plusDM.slice(1, diLength + 1).reduce((suma, valor) => suma + valor, 0);
  let minusSuavizado = minusDM.slice(1, diLength + 1).reduce((suma, valor) => suma + valor, 0);
  const dx = [];
  for (let indice = diLength; indice < velas.length; indice += 1) {
    if (indice > diLength) {
      trSuavizado = trSuavizado - trSuavizado / diLength + tr[indice];
      plusSuavizado = plusSuavizado - plusSuavizado / diLength + plusDM[indice];
      minusSuavizado = minusSuavizado - minusSuavizado / diLength + minusDM[indice];
    }
    const plus = 100 * plusSuavizado / trSuavizado;
    const minus = 100 * minusSuavizado / trSuavizado;
    plusDI[indice] = plus;
    minusDI[indice] = minus;
    dx.push({ indice, valor: 100 * Math.abs(plus - minus) / (plus + minus || 1) });
  }
  let adx = dx.slice(0, adxLength).reduce((suma, dato) => suma + dato.valor, 0) / adxLength;
  if (dx.length >= adxLength) resultado[dx[adxLength - 1].indice] = adx;
  for (let indice = adxLength; indice < dx.length; indice += 1) {
    adx = ((adx * (adxLength - 1)) + dx[indice].valor) / adxLength;
    resultado[dx[indice].indice] = adx;
  }
  return { adx: resultado, plusDI, minusDI };
}
