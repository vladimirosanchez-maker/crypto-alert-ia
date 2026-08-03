async function actualizarDashboard() {

    const btc = await consultarMoneda("BTCUSDT");
    const eth = await consultarMoneda("ETHUSDT");

    if (btc) {

        mostrarMoneda(
            btc,
            "precioBTC",
            "cambioBTC",
            "horaBTC"
        );

    }

    if (eth) {

        mostrarMoneda(
            eth,
            "precioETH",
            "cambioETH",
            "horaETH"
        );

    }

}
function mostrarMoneda(moneda, idPrecio, idCambio, idHora){

    const precio = Number(moneda.lastPrice);

    document.getElementById(idPrecio).innerHTML =
        "$ " +
        precio.toLocaleString("es-CO",{
            minimumFractionDigits:2,
            maximumFractionDigits:2
        });

    const cambio = Number(moneda.priceChangePercent);

    if(cambio>=0){

        document.getElementById(idCambio).innerHTML =
        "🟢 ▲ +" + cambio.toFixed(2) + "%";

    }

    else{

        document.getElementById(idCambio).innerHTML =
        "🔴 ▼ " + cambio.toFixed(2) + "%";

    }

    document.getElementById(idHora).innerHTML =
        "Actualizado: " +
        new Date().toLocaleTimeString();

}
actualizarDashboard();

setInterval(actualizarDashboard, CONFIG.INTERVALO_ACTUALIZACION);