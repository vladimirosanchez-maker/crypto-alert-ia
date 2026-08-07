# Arquitectura

## Estructura

``` text
css/
  style.css
  layout.css
  responsive.css

js/
  api.js
  config.js
  dashboard.js

  charts/
    grafica.js
    ema.js
    volumen.js
    adx.js

  ia/
    analizador.js

  ui/
    etiquetas.js
    layout.js
    workspace.js
```

## Responsabilidades

-   api.js: comunicación con Binance.
-   config.js: configuración global.
-   grafica.js: render de velas y coordinación.
-   ema.js: cálculo de EMA.
-   volumen.js: gráfico de volumen.
-   adx.js: cálculo del ADX.
-   dashboard.js: watchlist e información general.
-   workspace.js: persistencia de estado.
