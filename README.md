# Simulador BoscoAgro IoT

Simulación animada e interactiva del prototipo de **riego automático** del equipo **BoscoAgro IoT**
(U.E. Don Bosco Quintanilla, Cochabamba · Olimpiadas STEM+ Bolivia 2026, categoría Juvenil).

Muestra paso a paso cómo funciona el sistema: el sensor de humedad mide la tierra, la placa ESP32
decide si hay que regar, el relé enciende la minibomba, el agua llega al gotero y los datos se
envían a un dashboard por Wi-Fi.

## Qué se puede hacer

- Ver el ciclo completo animado: **Arranque → Medir → Decidir → Regar → Reportar** (las 5 preguntas de funcionamiento del HC6).
- **Tocar cualquier pieza** (sensor, placa, relé, bomba, depósito, manguera, fuente, dashboard, planta) para verla ampliada, con su explicación y lo que hay que cuidar al construirla.
- Modo **paso a paso** y control de velocidad.
- Ver **la línea del programa** que se está ejecutando en cada momento: el botón **Código corriendo**
  (esquina inferior derecha) la muestra en vivo y, al presionarlo, abre el programa completo en un panel lateral.
- **Probar fallas**: cortar el Wi-Fi, desconectar el sensor, vaciar el depósito o soltar la manguera.
- **Dashboard del huerto**: riegos de hoy (contador), tabla con hora, agua usada y humedad antes/después,
  total de agua del día, gráfico de humedad con cada riego marcado y las líneas de 35 % y 50 %, y el estado
  actual (humedad, bomba, Wi-Fi). Sin Wi-Fi muestra "sin conexión" y se pone al día cuando vuelve.
- **Seguimiento del programa**: tabla que se llena con cada medición, como si se ejecutara el programa a mano,
  con la explicación en palabras de lo que hace la placa en ese momento. Avanza junto con el modo paso a paso.

> Los números (umbral de 35 %, parada en 50 %, 3 s por riego, 75 ml por pulso) son de ejemplo.
> Los valores reales salen de calibrar el sensor y medir el caudal de la bomba.

- **¿Qué haría la placa?**: calculadora donde se escribe un número del sensor y se ve la cuenta
  (número → %), la decisión con los dos límites y cuánto tardaría (pulsos necesarios o horas hasta el
  próximo riego).
- **Código explicado**: en el panel del código, cada línea tiene su traducción al español.
- **Próximo riego**: el dashboard estima a qué hora volverá a regar, con los datos que recibió.
- **Probar con otros números**: panel para cambiar los límites, el pulso, la calibración del sensor o lo
  que se seca por hora, sin tocar el código. Los números quedan en la dirección
  (por ejemplo `index.html?UMBRAL_RIEGO=40`), así se puede compartir el enlace.

- **Portapilas con interruptor** (la batería de la lista de materiales): botones **Apagar batería** y
  **Pilas nuevas**. Las pilas se van gastando; si se apagan o se agotan, la placa deja de funcionar y al
  volver empieza de cero desde `setup()`. El dashboard muestra la batería y avisa cuando está baja.
  A escala real lo reemplazaría un panel solar con batería.
- **Botón QR** (debajo del dibujo): muestra un QR a pantalla completa. Con ‹ › se pasa al siguiente:
  los 4 primeros abren las sorpresas de la carpeta `qr/` y el quinto abre el simulador.
  Los QR se arman solos con la dirección donde está publicada la página (por ejemplo en Vercel).
  **Después de la reunión conviene borrar la carpeta `qr/`** antes de mostrar el enlace al jurado.

## Cómo abrirlo

No necesita instalar nada: abre `index.html` con doble clic en cualquier navegador
(Chrome, Edge, Firefox). Las fuentes tipográficas se cargan de Google Fonts; sin internet
se usan las fuentes del sistema y todo sigue funcionando.

## Publicarlo con GitHub Pages

1. Sube esta carpeta a tu repositorio (con `index.html` en la raíz o dentro de una carpeta).
2. En GitHub: **Settings → Pages**.
3. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)` (o `/docs` si lo pusiste ahí).
4. Guarda. En uno o dos minutos aparece el enlace, del tipo `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Estructura

```
index.html          Página y dibujo del prototipo (SVG)
css/estilos.css     Estilos (modo claro y oscuro)
js/simulador.js     Lógica de la simulación, textos de cada pieza y código mostrado
```

Para cambiar los textos de las piezas, edita el objeto `PARTS` en `js/simulador.js`.
Para cambiar los números (límites de 35 % y 50 %, 3 s y 75 ml por pulso, espera, máximo de pulsos,
calibración del sensor), edita el objeto `CONFIG` al inicio de `js/simulador.js`. Todo lo demás
(simulación, textos, código mostrado, dashboard y tabla de seguimiento) se actualiza solo.

## Créditos

Material de apoyo preparado por el mentor Juan José Huanca Esquivel para el equipo BoscoAgro IoT.
