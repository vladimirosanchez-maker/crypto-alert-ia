function formatearPrecio(valor) {
  return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actualizarReloj() {
  document.getElementById("horaSistema").textContent = new Date().toLocaleTimeString("es-CO", { hour12: false });
}

async function actualizarDashboard() {
  const tickers = await Promise.all(CONFIG.MONEDAS.map(consultarMoneda));
  tickers.filter(Boolean).forEach(actualizarWatchlist);
}

function actualizarWatchlist({ symbol, lastPrice }) {
  const precio = Number(lastPrice);
  if (!CONFIG.MONEDAS.includes(symbol) || !Number.isFinite(precio)) return;

  const etiqueta = document.getElementById(`precio${symbol.replace("USDT", "")}Lista`);
  if (etiqueta) etiqueta.textContent = formatearPrecio(precio);

  // La lista y la vela activa consumen el mismo tick de mercado.
  window.dispatchEvent(new CustomEvent("precio-mercado", { detail: { symbol, lastPrice: precio } }));
}

document.querySelectorAll(".itemCripto").forEach((item) => {
  item.addEventListener("click", () => cambiarActivo(item.dataset.symbol));
});

actualizarDashboard();
actualizarReloj();
setInterval(actualizarDashboard, CONFIG.INTERVALO_ACTUALIZACION);
setInterval(actualizarReloj, 1000);
suscribirPreciosEnTiempoReal(CONFIG.MONEDAS, actualizarWatchlist);
