async function consultarMoneda(simbolo){

    try{

        const respuesta = await fetch(

            CONFIG.API_FUTURES +

            "/fapi/v1/ticker/24hr?symbol=" +

            simbolo

        );

        return await respuesta.json();

    }

    catch(error){

        console.log(error);

        return null;

    }

}

async function consultarVelas(simbolo, intervalo = "15m", limite = 1200){

    try{

        const respuesta = await fetch(

            CONFIG.API_FUTURES +
            "/fapi/v1/klines?symbol=" +
            simbolo +
            "&interval=" +
            intervalo +
            "&limit=" +
            limite

        );

        return await respuesta.json();

    }

    catch(error){

        console.error(error);

        return [];

    }

}