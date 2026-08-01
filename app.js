async function obtenerPrecios() {

    try {

        const respuesta = await fetch(
            'https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT"]'
        );

        const datos = await respuesta.json();

        actualizarMoneda(
            datos[0],
            "precioBTC",
            "cambioBTC",
            "horaBTC"
        );

        actualizarMoneda(
            datos[1],
            "precioETH",
            "cambioETH",
            "horaETH"
        );

    }

    catch(error){

        console.log(error);

    }

}

function actualizarMoneda(moneda, idPrecio, idCambio, idHora){

    const precio = Number(moneda.lastPrice);

    document.getElementById(idPrecio).innerHTML =
        "$ " + precio.toLocaleString("es-CO",{
            minimumFractionDigits:2,
            maximumFractionDigits:2
        });

    const cambio = Number(moneda.priceChangePercent);

    let textoCambio="";

    if(cambio>=0){

        textoCambio="🟢 ▲ +" + cambio.toFixed(2) + "%";

    }

    else{

        textoCambio="🔴 ▼ " + cambio.toFixed(2) + "%";

    }

    const elementoCambio=document.getElementById(idCambio);

    elementoCambio.innerHTML=textoCambio;

    elementoCambio.className="cambio " + (cambio>=0 ? "sube":"baja");

    const hora=new Date();

    document.getElementById(idHora).innerHTML=

        "Actualizado: "

        +hora.toLocaleTimeString();

}

obtenerPrecios();

setInterval(obtenerPrecios,10000);