function crearGraficaRSI() {
  const contenedor = document.getElementById("panelRSI");
  const graficaRSI = LightweightCharts.createChart(contenedor, {
    width: contenedor.clientWidth,
    height: LAYOUT.rsi,
    layout: { background: { color: "transparent" }, textColor: "#8792a2", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { color: "#1c242e" }, horzLines: { color: "#1c242e" } },
    rightPriceScale: { borderColor: "#26303c", minimumWidth: 78, scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: "#26303c", visible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: "#d8e0e8aa", width: 1, style: LightweightCharts.LineStyle.Dotted }, horzLine: { color: "#d8e0e8aa", width: 1, style: LightweightCharts.LineStyle.Dotted } },
    handleScroll: false,
    handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: true, axisDoubleClickReset: true }
  });
  const rsi = graficaRSI.addLineSeries({ color: "#f4df17", lineWidth: 1, title: "", priceLineVisible: false });
  const senal = graficaRSI.addLineSeries({ color: "#f1f5f9", lineWidth: 1, title: "", priceLineVisible: false });
  const limiteInferior = graficaRSI.addLineSeries({ color: "rgba(0,0,0,0)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
  const limiteSuperior = graficaRSI.addLineSeries({ color: "rgba(0,0,0,0)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
  const bandas = [CONFIG.RSI.bandaInferior, CONFIG.RSI.bandaMedia, CONFIG.RSI.bandaSuperior];
  const lineasBanda = bandas.map((nivel) => rsi.createPriceLine({ price: nivel, color: nivel === CONFIG.RSI.bandaMedia ? "#657080" : "#73758a", lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false }));
  return { graficaRSI, rsi, senal, limiteInferior, limiteSuperior, lineasBanda };
}

function calcularRSI(velas, periodo = CONFIG.RSI.periodo) {
  if (velas.length <= periodo) return [];
  let ganancias = 0;
  let perdidas = 0;
  for (let indice = 1; indice <= periodo; indice += 1) {
    const cambio = velas[indice].close - velas[indice - 1].close;
    ganancias += Math.max(cambio, 0);
    perdidas += Math.max(-cambio, 0);
  }
  let gananciaMedia = ganancias / periodo;
  let perdidaMedia = perdidas / periodo;
  const resultado = [];
  const agregar = (indice) => {
    const valor = perdidaMedia === 0 ? 100 : 100 - 100 / (1 + gananciaMedia / perdidaMedia);
    resultado.push({ time: velas[indice].time, value: valor });
  };
  agregar(periodo);
  for (let indice = periodo + 1; indice < velas.length; indice += 1) {
    const cambio = velas[indice].close - velas[indice - 1].close;
    gananciaMedia = ((gananciaMedia * (periodo - 1)) + Math.max(cambio, 0)) / periodo;
    perdidaMedia = ((perdidaMedia * (periodo - 1)) + Math.max(-cambio, 0)) / periodo;
    agregar(indice);
  }
  return resultado;
}

function calcularMediaRSI(datosRSI, periodo = CONFIG.RSI.periodoSuavizado) {
  return datosRSI.map((punto, indice) => {
    const inicio = Math.max(0, indice - periodo + 1);
    const bloque = datosRSI.slice(inicio, indice + 1);
    return { time: punto.time, value: bloque.reduce((suma, dato) => suma + dato.value, 0) / bloque.length };
  });
}
