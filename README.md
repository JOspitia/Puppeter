# Pupetter

Prácticas de **Puppeteer** (automatización de navegador) sobre casos reales, con un módulo que
obtiene de forma automática una **llave de licencia de ESET HOME** (prueba gratuita de 30 días)
registrando una cuenta, verificando el correo y completando el asistente de suscripción.

El repositorio mezcla dos cosas: una base de pruebas de interacción con la web (navegación,
eventos de ratón, formularios) y el flujo automatizado de ESET, que es la parte que se documenta
en detalle aquí.

---

## Requisitos

| Componente | Versión |
|---|---|
| Node.js | **>= 22.12.0** (lo exige `puppeteer@25`) |
| Google Chrome | instalado en el sistema (se usa como ejecutable de Puppeteer) |
| SO | Windows / macOS / Linux |

```bash
node -v   # v22.12.0 o superior
```

---

## Instalación

```bash
npm install
```

Puppeteer descarga su propio Chromium en `~/.cache/puppeteer` durante la instalación. Si esa
descarga queda incompleta (ver [Problemas frecuentes](#problemas-frecuentes)), el script usa
automáticamente el Chrome del sistema.

---

## Uso

### Obtener una llave de ESET

```bash
npm run eset
```

Equivale a `node run.js`. Abre el navegador de forma visible (`headless: false`) para que
puedas seguir el proceso paso a paso, y deja el resultado en `licencia-eset.txt`.

### Ejecutar las pruebas

```bash
npm test
```

Ejecuta **todas** las suites. Ver [Pruebas](#pruebas) para el detalle de qué suite es la que
mantiene el flujo de ESET.

### Variables de entorno

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `ESET_CHROME_PATH` | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Ruta del ejecutable de Chrome cuando el Chromium de Puppeteer no arranca |
| `ESET_TIMEOUT_MS` | `480000` (8 min) | Guardia global: aborta el proceso completo si se supera |

```bash
# Windows PowerShell
$env:ESET_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:ESET_TIMEOUT_MS = "300000"
npm run eset
```

---

## Cómo funciona el flujo de ESET

```
1. temp-mail.org / mail.tm   ->  dirección de correo temporal
2. login.eset.com/register   ->  alta de cuenta (email + contraseña)
3. correo "Confirm registration" ->  enlace /link/confirmregistration?token=...
4. home.eset.com/onboarding  ->  "Start a free 30-day trial"
5. home.eset.com/subscriptions ->  "Open subscription" -> detalle de licencia
```

### Las pantallas reales del asistente

| # | Pantalla | Acción |
|---|---|---|
| 1 | `/onboarding/welcome` | carrusel de bienvenida, `Continue` ×3 |
| 2 | `/onboarding/subscriptions` | tarjeta **"Start a free 30-day trial"** → `Continue` |
| 3 | `/onboarding/trial-subscription` | elegir **"Protect your home"** → `Continue` |
| 4 | `/onboarding/download` | `Continue` → modal → **"Continue to ESET HOME"** |
| 5 | `home.eset.com/` | **Subscriptions** → **"Open subscription"** |
| 6 | detalle de licencia | `[data-label="license-detail-license-key"]` |

### El detalle que hace funcionar el script: `data-label`

El código original usaba selectores como `#root > div > div > div.css-1siz9ha > div > ...`.
Esas clases `css-xxxx` las genera el bundler de ESET y **cambian en cada build**, así que el
script se rompía con cualquier actualización.

La aplicación de ESET expone un atributo `data-label` estable que sí sobrevive a los despliegues:

```js
await page.click('[data-label="register-create-account-button"]');
await page.click('[data-label="onboarding-add-subscription-protect-card-trial"]');
await page.click('[data-label="onboarding-finish-protection-modal-finish-btn"]');
await page.click('[data-label="license-list-open-detail-page-btn"]');

const llave = await page.$eval(
    '[data-label="license-detail-license-key"] p',
    el => el.innerText
);
```

Todos los selectores del módulo usan este atributo. Cuando no hay `data-label`, se busca por
**texto visible**, no por clase CSS.

### Proveedores de correo temporal

El módulo prueba varios proveedores en orden y cae al siguiente si uno falla:

| Proveedor | Cómo funciona | Notas |
|---|---|---|
| **mail.tm** (principal) | API REST: alta de buzón, token y lectura de mensajes | sin navegador y sin Cloudflare |
| **temp-mail.org** (respaldo) | mediante el navegador | se bloquea con HTTP 429 si se generan muchos buzones seguidos desde la misma IP |

> **Nota sobre el filtro del correo.** En la API de mail.tm el campo `from` es un objeto
> `{ address, name }`, no una cadena. Concatenarlo sin más produce `[object Object]` y el correo
> *"Account confirmation"* de ESET nunca coincide con el filtro, dando la falsa impresión de
> que el correo no llegó.

### Cronometraje

Cada línea del log lleva el tiempo transcurrido, y al final se imprime el desglose por fase:

```
[00:00] [1/5] obteniendo correo temporal via mail.tm...
[00:02]       mail.tm: eset7f3k1p9x2m@fldubai.com
[00:17] [2/5] cuenta creada
[00:18] [3/5] correo recibido, abriendo el enlace...
[00:25] [3/5] correo verificado -> https://home.eset.com/onboarding/welcome
[00:43] [4/5] onboarding de prueba -> https://home.eset.com/onboarding/trial-subscription
[01:08]
*** LLAVE DE LICENCIA ESET ***
5RV2-XXG6-H4GM-PMHA-CUCG

desglose: correo temporal=2.4s  registro=17.7s  llegada del correo=18.9s
          verificacion=25.3s  onboarding=43.7s  licencia=68.9s
total: 68.9s
```

Referencia: el correo de verificación de ESET llega en **~1 segundo**; el paso más lento es el
registro (carga de página y formulario).

---

## Pruebas

| Suite | Qué cubre | Estado |
|---|---|---|
| `__tests__/navedaor.test.js` | abrir/cerrar navegador, `goBack`/`goForward`, pestañas | funciona |
| `__tests__/interactuandoConElementos.test.js` | click derecho, doble click, escritura, checkbox, radio, `select` | funciona |
| `__tests__/autoESET.test.js` | flujo completo de ESET de punta a punta | funciona |
| `__tests__/autoESETtemp.test.js` | versión antigua del flujo de ESET | **obsoleta** |
| `autoESETtemp.test.js` (raíz) | copia de la versión antigua | **obsoleta** |

Las dos últimas usan los selectores `css-xxxx` antigos, por lo que fallan contra la web actual.
Para ejecutar solo la suite que sí funciona:

```bash
npx jest __tests__/autoESET.test.js
```

O, sobre el runner directo (sin Jest):

```bash
npm run eset
```

---

## Estructura del proyecto

```
.
├── eset-license.js            # módulo principal: flujo de ESET completo
├── run.js                     # runner: node run.js
├── jest.config.mjs
├── package.json
├── .prettierrc
├── licencia-eset.txt          # salida de la llave (NO se versiona)
└── __tests__/
    ├── autoESET.test.js       # test del flujo de ESET
    ├── navedaor.test.js
    ├── interactuandoConElementos.test.js
    └── autoESETtemp.test.js   # obsoleta
```

### API del módulo

```js
import { obtenerLicenciaESET } from './eset-license.js';

const { email, licencia, pasos, totalMs, error } = await obtenerLicenciaESET({
    headless: false,                       // mostrar el navegador
    password: 'Prueba123*',                 // contraseña de la cuenta creada
    guardarEn: 'licencia-eset.txt',         // dónde escribir la llave
    timeoutGlobal: 8 * 60 * 1000,           // guardia global
    proveedores: ['mail.tm', 'temp-mail.org'],
    log: console.log,
});
```

Funciones exportadas por separado: `crearMailboxMailTm`, `crearMailboxTempMailOrg`,
`registrarCuenta`, `registroAceptado`, `activarPruebaGratuita`, `asegurarOnboarding`,
`extraerLlave`.

---

## Problemas frecuentes

### `Failed to launch the browser process: Code: 2147483651` / `Invalid file descriptor to ICU data`

La descarga del Chromium de Puppeteer quedó incompleta (faltan `icudtl.dat` y los blobs de V8).
No es problema del código: basta usar el Chrome del sistema.

```bash
$env:ESET_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Para rehacer la descarga:

```bash
npx puppeteer browsers install chrome
```

### temp-mail.org devuelve HTTP 429

Limite de buzones por IP. El módulo cae automáticamente a **mail.tm**, que va por API.

### El proceso se queda en `login.eset.com/welcome`

Tras confirmar el correo, ESET a veces no deja sesión iniciada y redirige a la pantalla de
login en vez del asistente. El módulo lo detecta (`log-in-button`) e inicia sesión con la misma
cuenta para continuar.

### La sesión expira o el flujo cambia de pantalla

Cada pantalla se resuelve por su `data-label` o por su texto visible. Si ESET renombra un
`data-label`, basta actualizar la constante correspondiente en `eset-license.js`; el log imprime
el `data-label` y el texto de los botones de cada pantalla para localizar el cambio rápido.

---

## Nota legal

Este proyecto automatiza el alta de cuentas en ESET HOME para obtener **pruebas gratuitas de 30
días** mediante correo desechable. Ten en cuenta que:

- El uso de cuentas temporales y la automatización del registro pueden ir en contra de los
  [términos de uso de ESET](https://www.eset.com/legal/terms-of-use/) y de las políticas del
  proveedor de correo temporal.
- Las licencias de prueba son de un solo uso por persona/dispositivo; usarlas en un equipo sin
  autorización del titular del equipo puede ser ilegal.
- Usa el código con fines de aprendizaje de Puppeteer y sobre cuentas y equipos propios. Si
  necesitas protección para tu equipo, hay licencias de prueba y descuentos oficiales de ESET.

El autor no se hace responsable del uso indebido de las llaves generadas.

---

## Licencia

[ISC](./LICENSE) — ver `package.json`.
