const POSICIONES_EXCHANGE = (() => {
  const CLAVE_SESION = "cryptoAlert:positionsToken";
  const intervalo = 10000;
  let consultando = false;

  const elementos = {
    estado: document.getElementById("estadoPosiciones"),
    lista: document.getElementById("listaPosiciones"),
    boton: document.getElementById("conectarPosiciones"),
    actualizado: document.getElementById("actualizadoPosiciones")
  };

  function urlApi() { return String(window.CRYPTO_ALERT_CONFIG?.POSITIONS_API_URL || "").replace(/\/$/, ""); }
  function token() { return sessionStorage.getItem(CLAVE_SESION) || ""; }
  function precio(valor) { return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function numero(valor, decimales = 2) { return Number(valor).toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }); }

  function crearDato(etiqueta, valor) {
    const contenedor = document.createElement("div");
    const nombre = document.createElement("span");
    const dato = document.createElement("b");
    nombre.textContent = etiqueta;
    dato.textContent = valor;
    contenedor.append(nombre, dato);
    return contenedor;
  }

  function renderizar(posiciones, errores = []) {
    elementos.lista.replaceChildren();
    posiciones.sort((a, b) => `${a.exchange}${a.symbol}`.localeCompare(`${b.exchange}${b.symbol}`)).forEach((posicion) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = `posicion-exchange ${posicion.pnl >= 0 ? "ganancia" : "perdida"}`;
      const cabecera = document.createElement("header");
      const titulo = document.createElement("strong");
      const pnl = document.createElement("em");
      titulo.textContent = `${posicion.exchange} · ${posicion.symbol.replace("USDT", "")} · ${posicion.side}`;
      pnl.textContent = `${posicion.pnl >= 0 ? "+" : ""}${numero(posicion.pnl)} USDT (${posicion.pnlPercent >= 0 ? "+" : ""}${numero(posicion.pnlPercent)}%)`;
      cabecera.append(titulo, pnl);
      const datos = document.createElement("div");
      datos.append(
        crearDato("Entrada real", precio(posicion.entryPrice)),
        crearDato("Mark price", precio(posicion.markPrice)),
        crearDato("Cantidad", numero(posicion.quantity, 6)),
        crearDato("Margen", `${numero(posicion.margin)} USDT`),
        crearDato("Apalancamiento", `${numero(posicion.leverage, 0)}×`),
        crearDato("Liquidación", posicion.liquidationPrice > 0 ? precio(posicion.liquidationPrice) : "--")
      );
      tarjeta.append(cabecera, datos);
      elementos.lista.append(tarjeta);
    });
    if (!posiciones.length) {
      const vacio = document.createElement("p");
      vacio.className = "posiciones-vacias";
      vacio.textContent = "No hay posiciones abiertas de BTC o ETH.";
      elementos.lista.append(vacio);
    }
    elementos.estado.textContent = errores.length
      ? `Conectado parcialmente: ${errores.map((error) => `${error.exchange}: ${error.message}`).join(" · ")}`
      : "Binance y BingX conectados";
  }

  async function consultar() {
    if (consultando || !token() || !urlApi() || document.hidden) return;
    consultando = true;
    try {
      const controlador = new AbortController();
      const limite = setTimeout(() => controlador.abort(), 8000);
      const respuesta = await fetch(`${urlApi()}/positions`, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store", signal: controlador.signal });
      clearTimeout(limite);
      const datos = await respuesta.json();
      if (respuesta.status === 401) {
        sessionStorage.removeItem(CLAVE_SESION);
        elementos.boton.textContent = "Conectar cuentas";
        throw new Error("Token de panel incorrecto");
      }
      if (!respuesta.ok && !datos.positions?.length) throw new Error(datos.error || datos.errors?.map((error) => error.message).join(" · ") || "No fue posible consultar posiciones");
      renderizar(datos.positions || [], datos.errors || []);
      elementos.actualizado.textContent = `Actualizado ${new Date(datos.updatedAt).toLocaleTimeString("es-CO", { hour12: false })}`;
    } catch (error) {
      elementos.estado.textContent = error.name === "AbortError" ? "Tiempo de espera agotado" : error.message;
    } finally { consultando = false; }
  }

  function conectar() {
    if (!urlApi()) {
      elementos.estado.textContent = "Falta configurar POSITIONS_API_URL en js/runtime-config.js";
      return;
    }
    if (token()) {
      sessionStorage.removeItem(CLAVE_SESION);
      elementos.boton.textContent = "Conectar cuentas";
      elementos.estado.textContent = "Cuentas desconectadas de esta pestaña";
      elementos.lista.replaceChildren();
      return;
    }
    const acceso = window.prompt("Introduce el token privado del panel (no es una clave del exchange):");
    if (!acceso) return;
    sessionStorage.setItem(CLAVE_SESION, acceso.trim());
    elementos.boton.textContent = "Desconectar";
    consultar();
  }

  elementos.boton.addEventListener("click", conectar);
  if (token()) { elementos.boton.textContent = "Desconectar"; consultar(); }
  else if (!urlApi()) elementos.estado.textContent = "Backend pendiente de configurar";
  setInterval(consultar, intervalo);
  document.addEventListener("visibilitychange", consultar);
  return { consultar };
})();
