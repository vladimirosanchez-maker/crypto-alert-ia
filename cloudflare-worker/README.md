# Backend privado de posiciones

Este Worker permite que la interfaz alojada en GitHub Pages consulte posiciones abiertas de BTC y ETH sin exponer secretos de Binance o BingX.

## Despliegue

1. Instala Node.js y autentica Wrangler:

   ```powershell
   npx wrangler login
   ```

2. Desde `cloudflare-worker`, registra los cuatro secretos de los exchanges y un token independiente para proteger el panel:

   ```powershell
   npx wrangler secret put BINANCE_API_KEY
   npx wrangler secret put BINANCE_SECRET_KEY
   npx wrangler secret put BINGX_API_KEY
   npx wrangler secret put BINGX_SECRET_KEY
   npx wrangler secret put DASHBOARD_TOKEN
   ```

3. Despliega:

   ```powershell
   npx wrangler deploy
   ```

4. Copia la URL `https://...workers.dev` resultante en `js/runtime-config.js`.

5. Si GitHub Pages utiliza un dominio personalizado, reemplázalo en `ALLOWED_ORIGINS` dentro de `wrangler.jsonc` y vuelve a desplegar.

## Seguridad

- Crea claves API nuevas y exclusivamente de lectura.
- No habilites trading, transferencias ni retiros.
- Nunca escribas claves en archivos del repositorio.
- `DASHBOARD_TOKEN` no es una clave del exchange: usa una cadena larga y aleatoria distinta.
- El navegador guarda ese token sólo durante la pestaña actual (`sessionStorage`).
- Cloudflare Workers no garantiza una IP de salida fija en el plan normal; una lista blanca de IP del exchange requiere una solución con egress estático.
