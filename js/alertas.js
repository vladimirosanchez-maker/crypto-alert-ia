const ALERTAS = (() => {
  const dialogo = document.getElementById("dialogoAlertas");
  const formulario = document.getElementById("formularioAlerta");
  const lista = document.getElementById("listaAlertas");
  const contenedorNotificaciones = document.getElementById("notificacionesAlertas");
  const preciosAnteriores = new Map();
  let alertas = WORKSPACE.cargar()?.alertas || [];

  function formatearPrecioAlerta(valor) {
    return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function guardar() {
    const workspace = WORKSPACE.cargar() || {};
    WORKSPACE.guardar({ ...workspace, alertas });
  }

  function notificarCambio() {
    window.dispatchEvent(new CustomEvent("alertas-cambiadas", { detail: { alertas: [...alertas] } }));
  }

  function etiquetaCondicion(condicion) {
    return condicion === "above" ? "Por encima de" : "Por debajo de";
  }

  function renderizar() {
    if (!alertas.length) {
      lista.innerHTML = '<p class="sin-alertas">Aún no has creado alertas.</p>';
      return;
    }
    lista.innerHTML = alertas.map((alerta) => `<article class="alerta-item ${alerta.activa ? "" : "alerta-disparada"}">
      <div><strong>${alerta.symbol.replace("USDT", " / USDT")}</strong><span>${etiquetaCondicion(alerta.condicion)} ${formatearPrecioAlerta(alerta.precio)}</span><small>${alerta.activa ? (alerta.frecuencia === "repeat" ? "Activa · cada cruce" : "Activa · una vez") : "Desactivada"}</small></div>
      <div class="acciones-alerta"><button type="button" data-alternar-alerta="${alerta.id}">${alerta.activa ? "Desactivar" : "Activar"}</button><button type="button" data-eliminar-alerta="${alerta.id}" aria-label="Eliminar alerta">×</button></div>
    </article>`).join("");
  }

  function mostrarAviso(alerta, precio) {
    const titulo = `Alerta ${alerta.symbol.replace("USDT", "")}`;
    const mensaje = `${etiquetaCondicion(alerta.condicion).toLowerCase()} ${formatearPrecioAlerta(alerta.precio)}. Precio actual: ${formatearPrecioAlerta(precio)} USDT`;
    const aviso = document.createElement("article");
    aviso.className = "aviso-alerta";
    aviso.innerHTML = `<img src="assets/crypto-alert-logo.png" alt=""><div><strong>${titulo}</strong><span>${mensaje}</span></div><button type="button" aria-label="Cerrar aviso">×</button>`;
    aviso.querySelector("button").addEventListener("click", () => aviso.remove());
    contenedorNotificaciones.append(aviso);
    setTimeout(() => aviso.remove(), 12000);

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(titulo, { body: mensaje, icon: "assets/crypto-alert-logo.png" });
    }
  }

  function procesarPrecio({ symbol, lastPrice }) {
    const precio = Number(lastPrice);
    if (!Number.isFinite(precio)) return;
    const anterior = preciosAnteriores.get(symbol);
    preciosAnteriores.set(symbol, precio);
    if (!Number.isFinite(anterior)) return;

    let cambio = false;
    alertas.forEach((alerta) => {
      if (!alerta.activa || alerta.symbol !== symbol) return;
      const cruzaArriba = alerta.condicion === "above" && anterior < alerta.precio && precio >= alerta.precio;
      const cruzaAbajo = alerta.condicion === "below" && anterior > alerta.precio && precio <= alerta.precio;
      if (!cruzaArriba && !cruzaAbajo) return;
      if (alerta.frecuencia !== "repeat") {
        alerta.activa = false;
        cambio = true;
      }
      alerta.disparadaEn = Date.now();
      mostrarAviso(alerta, precio);
    });
    if (cambio) { guardar(); renderizar(); notificarCambio(); }
  }

  function abrir() {
    const tituloActivo = document.getElementById("activoTitulo")?.textContent;
    if (CONFIG.MONEDAS.includes(tituloActivo)) document.getElementById("alertaSimbolo").value = tituloActivo;
    renderizar();
    dialogo.showModal();
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const precio = Number(datos.get("precio"));
    if (!Number.isFinite(precio) || precio <= 0) return;
    alertas.unshift({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      symbol: datos.get("simbolo"),
      condicion: datos.get("condicion"),
      precio,
      frecuencia: datos.get("frecuencia"),
      activa: true,
      creadaEn: Date.now()
    });
    formulario.reset();
    guardar();
    renderizar();
    notificarCambio();
  });

  lista.addEventListener("click", (evento) => {
    const alternar = evento.target.closest("[data-alternar-alerta]");
    if (alternar) {
      const alerta = alertas.find((elemento) => elemento.id === alternar.dataset.alternarAlerta);
      if (!alerta) return;
      alerta.activa = !alerta.activa;
      guardar();
      renderizar();
      notificarCambio();
      return;
    }
    const boton = evento.target.closest("[data-eliminar-alerta]");
    if (!boton) return;
    alertas = alertas.filter((alerta) => alerta.id !== boton.dataset.eliminarAlerta);
    guardar();
    renderizar();
    notificarCambio();
  });

  document.getElementById("abrirAlertas").addEventListener("click", abrir);
  document.getElementById("cerrarAlertas").addEventListener("click", () => dialogo.close());
  document.getElementById("activarNotificaciones").addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
  });
  window.addEventListener("precio-mercado", ({ detail }) => procesarPrecio(detail || {}));

  renderizar();
  return { abrir, obtener: () => [...alertas] };
})();
