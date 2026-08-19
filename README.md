# Crypto Alert IA Pro

Panel técnico de BTC y ETH con análisis multitemporal, contexto macro/on-chain y detección de oportunidades LONG/SHORT.

## Posiciones privadas de Binance y BingX

La interfaz puede mostrar posiciones abiertas de BTC y ETH en Binance USDⓈ-M Futures y BingX Perpetual Futures. GitHub Pages aloja solamente el frontend; las peticiones firmadas se ejecutan en un Cloudflare Worker para evitar que las claves API lleguen al navegador.

Consulta [cloudflare-worker/README.md](cloudflare-worker/README.md) para desplegar el backend, registrar los secretos y configurar su URL pública.
