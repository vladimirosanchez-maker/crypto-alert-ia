function crearGraficaVolumen() {
  const contenedor = document.getElementById("panelVolumen");
  const graficaVolumen = LightweightCharts.createChart(contenedor, {
    width: contenedor.clientWidth, height: LAYOUT.volumen,
    layout: { background: { color: "#0b0e11" }, textColor: "#8792a2", fontSize: 11 },
    grid: { vertLines: { color: "#1c242e" }, horzLines: { color: "#1c242e" } },
    rightPriceScale: { borderColor: "#26303c" }, timeScale: { borderColor: "#26303c", visible: false }
  });
  const volumen = graficaVolumen.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "" });
  return { graficaVolumen, volumen };
}
