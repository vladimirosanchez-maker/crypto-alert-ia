const ALERTAS = (() => {
  const dialogo = document.getElementById("dialogoAlertas");
  const formulario = document.getElementById("formularioAlerta");
  const lista = document.getElementById("listaAlertas");
  const contenedorNotificaciones = document.getElementById("notificacionesAlertas");
  const botonNotificaciones = document.getElementById("activarNotificaciones");
  const estadoNotificaciones = document.getElementById("estadoNotificaciones");
  const preciosAnteriores = new Map();
  let alertas = WORKSPACE.cargar()?.alertas || [];
  let registroNotificaciones = null;

  function esIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function esAplicacionInstalada() {
    return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  async function registrarNotificacionesMoviles() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
    try {
      await navigator.serviceWorker.register("./sw.js");
      return await navigator.serviceWorker.ready;
    } catch (error) {
      console.warn("No fue posible registrar las notificaciones móviles.", error);
      return null;
    }
  }

  function actualizarEstadoNotificaciones() {
    if (!("Notification" in window)) {
      estadoNotificaciones.textContent = esIOS()
        ? "En iPhone: instala la web en la pantalla de inicio y ábrela desde allí para activar avisos."
        : "Este navegador no admite notificaciones del sistema. Seguirás viendo el aviso dentro de la web.";
      estadoNotificaciones.className = "estado-notificaciones notificaciones-bloqueadas";
      botonNotificaciones.hidden = false;
      botonNotificaciones.disabled = true;
      botonNotificaciones.textContent = esIOS() ? "Primero: instalar la app" : "No disponible en este navegador";
      return;
    }

    botonNotificaciones.disabled = false;
    const permiso = Notification.permission;
    if (permiso === "granted") {
      estadoNotificaciones.textContent = "Notificaciones activadas en este dispositivo.";
      estadoNotificaciones.className = "estado-notificaciones notificaciones-listas";
      botonNotificaciones.textContent = "Notificaciones activas";
      return;
    }
    if (permiso === "denied") {
      estadoNotificaciones.textContent = "Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador o del sitio.";
      estadoNotificaciones.className = "estado-notificaciones notificaciones-bloqueadas";
      botonNotificaciones.textContent = "Notificaciones bloqueadas";
      return;
    }
    if (esIOS() && !esAplicacionInstalada()) {
      estadoNotificaciones.textContent = "Para recibir avisos en iPhone: Compartir → Añadir a pantalla de inicio; luego abre la app y activa las notificaciones.";
    } else {
      estadoNotificaciones.textContent = "Activa las notificaciones para recibir avisos del sistema mientras la aplicación mantiene conexión al mercado.";
    }
    estadoNotificaciones.className = "estado-notificaciones";
    botonNotificaciones.textContent = "Activar notificaciones";
  }

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

    enviarNotificacionSistema(titulo, mensaje);
  }

  async function enviarNotificacionSistema(titulo, mensaje) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opciones = {
      body: mensaje,
      icon: "assets/crypto-alert-logo.png",
      badge: "assets/crypto-alert-logo.png",
      tag: `crypto-alert-${titulo}`,
      renotify: true,
      data: { url: location.href }
    };
    const registro = await registroNotificaciones;
    if (registro?.showNotification) {
      await registro.showNotification(titulo, opciones);
      return;
    }
    new Notification(titulo, opciones);
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
    actualizarEstadoNotificaciones();
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
  botonNotificaciones.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
    actualizarEstadoNotificaciones();
  });
  window.addEventListener("precio-mercado", ({ detail }) => procesarPrecio(detail || {}));

  registroNotificaciones = registrarNotificacionesMoviles();
  actualizarEstadoNotificaciones();
  renderizar();
  return { abrir, obtener: () => [...alertas] };
})();
