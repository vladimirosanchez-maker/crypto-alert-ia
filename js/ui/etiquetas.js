let etiquetas = {};

function crearEtiqueta(id, color) {

    const panel = document.getElementById("panelEtiquetas");

    const div = document.createElement("div");

    div.className = "etiquetaPrecio";

    div.style.background = color;

    div.id = id;

    panel.appendChild(div);

    etiquetas[id] = div;

}

crearEtiqueta("precio", "#16a34a");

crearEtiqueta("ema10", "#2196F3");

crearEtiqueta("ema55", "#FFD700");

crearEtiqueta("ema200", "#FFFFFF");