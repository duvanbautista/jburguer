# Burger Liga

Propuesta de plataforma de votación para un festival gastronómico, con validación antifraude por dispositivo y red y **sin cuentas para el público**. Construida con Next.js 16 (App Router) y Supabase (Postgres, Auth, Storage, Realtime); también arranca sin Supabase en un modo demo en memoria.

Este documento sirve tanto al desarrollador que recibe el repositorio como al cliente que evalúa la propuesta. Las secciones 1 a 4 explican qué hace y por qué; de la 5 en adelante, cómo ponerla a andar.

**Contenido**

1. [El problema que resuelve](#1-el-problema-que-resuelve)
2. [Cómo funciona la validación](#2-cómo-funciona-la-validación)
3. [Funcionalidades](#3-funcionalidades)
4. [Puesta en marcha](#4-puesta-en-marcha)
5. [Scripts](#5-scripts)
6. [Estructura del proyecto](#6-estructura-del-proyecto)
7. [API pública](#7-api-pública)
8. [Despliegue](#8-despliegue)
9. [Limitaciones y decisiones honestas](#9-limitaciones-y-decisiones-honestas)
10. [Créditos](#10-créditos)

---

## 1. El problema que resuelve

Muchas plataformas de votación sin cuentas deciden "quién vota" con un identificador que **el propio navegador genera y guarda en `localStorage`** (o en una cookie normal) y que viaja al servidor en cada petición. El servidor solo deduplica por ese valor. En consecuencia, borrar la caché o los datos del sitio, abrir una ventana de incógnito, usar otro navegador o enviar la petición desde `curl` con otro identificador produce un votante "nuevo" y permite votar de nuevo. Un captcha solo frena la velocidad, no la identidad: no hay ninguna señal de dispositivo, red o IP ligada al voto. El fondo del problema es que el servidor delega en el cliente la pregunta "¿ya votaste?", y todo lo que el cliente controla (storage, cookies, cabeceras) se puede borrar o falsificar.

Esta propuesta parte de esa constatación: la identidad del votante se calcula en el servidor, con varias señales combinadas, y los votos dudosos no se descartan en silencio sino que quedan en cuarentena para revisión. Las reglas exactas del motor están comentadas en `src/lib/antifraud/engine.ts` y cubiertas por pruebas.

## 2. Cómo funciona la validación

Principios:

- **La identidad se calcula en el servidor** a partir de señales que una persona normal no cambia al borrar caché: huella de hardware del dispositivo, huella de cabeceras HTTP, IP y subred. Se combinan en `voter_key = HMAC(device_fp | server_fp)`, que es la identidad principal.
- **Defensa en capas.** Ninguna señal sola es perfecta; cada una que falla suma *riesgo*. Un voto con riesgo alto no se rechaza en silencio: entra en **cuarentena** (`suspect`) hasta que un administrador lo revise.
- **El conteo público solo muestra votos `valid`.** Si un atacante consigue insertar votos, no mueve el marcador visible; el fraude pierde su incentivo.
- **Los votos solo se escriben desde el servidor** (clave service role). Las políticas RLS impiden que el navegador inserte en `votes`, y los índices únicos de Postgres son la última barrera contra peticiones simultáneas.
- **Minimización de datos.** Se guardan HMAC-SHA256 con `VOTE_SECRET`; nunca IPs ni huellas en claro. Sin el secreto los hashes no se pueden correlacionar fuera del sistema.
- **Sin login para el público.** Cloudflare Turnstile es una capa opcional.

### Señales

| Señal | De dónde sale | Sobrevive a borrar caché | Sobrevive a cambiar de red | Puede colisionar entre personas |
|---|---|---|---|---|
| `cookie_id` | Cookie `bl_vid` httpOnly y firmada, sembrada en la primera visita | ✗ | ✓ | ✗ |
| `storage_id` | UUID guardado en localStorage, IndexedDB y Cache API; se restaura desde el que sobreviva | Parcial (hay que borrar los tres) | ✓ | ✗ |
| `device_fp` | HMAC de componentes de hardware: canvas, WebGL, pantalla, núcleos, memoria, plataforma, zona horaria, fuentes, audio | ✓ | ✓ | ✓ (dos móviles idénticos) |
| `server_fp` | HMAC de cabeceras: `user-agent`, `accept-language`, `sec-ch-ua*` | ✓ | ✓ | ✓ |
| `ip_hash` / `subnet_hash` | `x-forwarded-for` / `x-real-ip` (fiables detrás de Vercel o Cloudflare) | ✓ | ✗ | ✓ (wifi del festival, CGNAT) |
| `voter_key` | `HMAC(device_fp \| server_fp)` — identidad principal | ✓ | ✓ | baja |

### Flujo de un voto

```
[página del plato]  fingerprint.collect()  →  POST /api/vote/challenge { dishId, fp }
    servidor: deriva señales, siembra la cookie si falta, comprueba si este
    votante ya votó este plato y emite challenge = HMAC(dishId | voter_key | issuedAt)
                                      ↓
[botón "Votar" o "Ya votaste"]  (mínimo 1,5 s entre reto y voto; el reto caduca a los 10 min)
                                      ↓
POST /api/dishes/:id/vote { challenge, fp, turnstileToken? }
    servidor: valida el reto → motor antifraude (función pura, con pruebas) → inserta
    200 { status: 'valid' | 'suspect', votes_count }  |  409 ALREADY_VOTED
    429 RATE_LIMITED  |  403 BAD_CHALLENGE / VOTING_CLOSED / CAPTCHA_*
```

El motor (`src/lib/antifraud/engine.ts`) evalúa en orden: votación cerrada; reto inválido; duplicado por señal fuerte (cookie, storage, `voter_key` y, en modo estricto, `device_fp`); límites por IP (duros → 429, suaves → riesgo); calidad de la huella (sin canvas ni WebGL, UA de bot o cliente HTTP, recolector desconocido, respuesta demasiado rápida, cookie o storage bloqueados); Turnstile si está configurado. Si el riesgo acumulado alcanza `suspect_threshold` (60 por defecto) el voto entra en cuarentena. Cada intento, aceptado o no, queda registrado en `vote_attempts` con su resultado y razones.

### Comparativa

| | Identidad guardada en el navegador (enfoque habitual) | Esta propuesta |
|---|---|---|
| Identidad | UUID aleatorio del cliente en localStorage | HMAC en servidor de hardware + cabeceras + cookie + storage redundante |
| Borrar caché | vota de nuevo | misma identidad (`device_fp` / `voter_key`) ⇒ 409 |
| `curl` con otra cabecera | vota de nuevo | reto firmado + huella coherente + límite por IP + riesgo de bot ⇒ cuarentena o 429 |
| Conteo público | todos los votos | solo `valid`; los sospechosos esperan revisión |
| Trazabilidad | ninguna | `vote_attempts` con resultado y razones; panel de administración |
| Escritura de votos | cliente → API | solo servidor (service role; RLS deniega inserciones) |

## 3. Funcionalidades

### Vista pública (`/`, `/plato/:id`)

- **Ranking en vivo.** Portada con nombre del festival, edición y lema (editables desde el panel), estado de la votación y número de platos en competencia.
- **Podio y ranking completo.** Los tres primeros en tarjetas destacadas (el #1 en el centro y más alto en escritorio) y el resto en cuadrícula. Los contadores se actualizan sin recargar: con Supabase por Realtime (cambios en `dishes`), y si el canal falla o no hay Supabase, por sondeo cada 8 s. Un indicador muestra el modo activo.
- **Tarjetas con viñeta.** La foto ocupa toda la tarjeta con un degradado hacia negro en la base y una banda de vidrio con puesto, restaurante, plato, lugar que lo inspira y votos. Toda la tarjeta es un único enlace accesible.
- **Página de plato.** Foto grande, restaurante y ciudad, enlace a Instagram, historia del plato en párrafos, lista de ingredientes y metadatos Open Graph para compartir.
- **Votación.** Contador en vivo y botón de voto que gestiona todos los estados (ya votaste, en cuarentena, votación cerrada, límite alcanzado, captcha si está activo).
- **Sección "Cómo votamos"** que explica al público, en tres tarjetas, la validación por dispositivo, por red y la revisión sin cuentas.

### Panel de administración (`/login`, `/admin`)

Dos roles: **admin** (organización) y **restaurante** (solo ve y gestiona lo suyo).

| Sección | Admin | Restaurante |
|---|---|---|
| Resumen | Votos válidos, en cuarentena, duplicados bloqueados y limitados por red; tabla por plato | Lo mismo, acotado a sus platos |
| Platos | Crear, editar, publicar/despublicar y eliminar; nombre, lugar que lo inspira, historia, ingredientes (editor de lista) y foto (hasta 5 MB: JPEG, PNG, WebP o AVIF) | Sus platos |
| Restaurantes | Crear y editar participantes (nombre, ciudad, descripción, Instagram, logo) y **cuentas**: asignar rol y restaurante a cada perfil | — |
| Votos sospechosos | Filtrar por estado y plato; ver riesgo, razones, país, navegador, cookie y storage; **aprobar o rechazar** con nota; auditoría de los últimos 50 intentos | Consulta de los votos de sus platos |
| Ajustes | Textos de portada, abrir/cerrar votación, límites por IP (suave y duro), umbral de cuarentena, coincidencia de dispositivo estricta/flexible | — |

Un voto aprobado pasa a contar en el ranking; un voto rechazado nunca cuenta y deja de bloquear a ese votante.

### Temas

Toda la aplicación (vista pública, login y panel de administración) tiene selector de tema con tres estados: **automático** (sigue al sistema), **claro** y **oscuro**. La preferencia se guarda en el navegador y se aplica antes del primer pintado para evitar parpadeos. Las viñetas sobre fotografía mantienen siempre su banda oscura para que el texto se lea en ambos temas.

## 4. Puesta en marcha

### Requisitos

- Node.js **20.9 o superior** (lo exige Next.js 16) y npm.
- Opcional: un proyecto de Supabase. Sin él, la app funciona en modo demo.

### Instalación

```bash
npm install
cp .env.example .env.local   # en Windows: copy .env.example .env.local
```

Variables de entorno (`.env.local`):

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Solo modo Supabase | URL del proyecto (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Solo modo Supabase | Clave anónima; la usa el navegador para sesión y Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo modo Supabase | Clave service role; **solo servidor**, nunca al cliente ni a git |
| `VOTE_SECRET` | Sí en producción | Secreto HMAC para cookies, retos de voto, hashes de IP y huella, y sesión demo. En desarrollo, si falta, se usa un valor por defecto con aviso |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | No | Clave de sitio de Cloudflare Turnstile (captcha invisible) |
| `TURNSTILE_SECRET_KEY` | No | Clave secreta de Turnstile; al definirla el token pasa a ser obligatorio en cada voto |
| `NEXT_PUBLIC_SITE_URL` | No | URL pública para metadatos Open Graph absolutos; si falta se usa `VERCEL_URL` o `http://localhost:3000` |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | No | Credenciales del admin en modo demo (por defecto `admin@burgerliga.demo` / `demo1234`) |

Genera un `VOTE_SECRET` fuerte con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si tu proyecto de Supabase muestra las claves nuevas (`sb_publishable_…` y `sb_secret_…`) en lugar de `anon` y `service_role`, van en las mismas variables: la publicable en `NEXT_PUBLIC_SUPABASE_ANON_KEY` y la secreta en `SUPABASE_SERVICE_ROLE_KEY`.

### Modo demo (sin Supabase)

Deja vacías las tres variables `SUPABASE_*` y ejecuta `npm run dev`. La app detecta que no hay credenciales y arranca en memoria (`GET /api/health` responde `{ "mode": "memory" }`):

- Se cargan 14 restaurantes, 14 platos con foto e historia, los ajustes del festival y votos sintéticos repartidos en las últimas 48 h, desde `src/lib/seed-data.ts`.
- **Los datos viven en memoria.** Sobreviven a la recarga en caliente de `next dev`, pero se reinician al reiniciar el servidor. Las fotos subidas desde el panel se guardan en `public/uploads/` (ignorado por git).
- El motor antifraude, la cookie, el reto firmado y los índices únicos funcionan igual que con Supabase; la capa en memoria replica esa semántica.

Cuentas demo (la página de login las muestra cuando no hay Supabase):

| Rol | Correo | Contraseña |
|---|---|---|
| Admin | `admin@burgerliga.demo` | `demo1234` |
| Restaurante | `<slug>@burgerliga.demo`, p. ej. `la-fragua@burgerliga.demo` | `demo1234` |

Los slugs disponibles están en `src/lib/seed-data.ts` (`la-fragua`, `sal-y-brasa`, `puerto-ahumado`, `manigua`, `el-tambor`, `paramo`, `marea-alta`, `ruta-40`, `casa-cafetal`, `la-guajira`, `montana-roja`, `barrio-egipto`, `isla-verde`, `volcan`).

### Modo Supabase

1. **Crea un proyecto** en [supabase.com](https://supabase.com) y copia en `.env.local` la URL, la clave anónima y la service role (Project Settings → API).

2. **Aplica la migración** `supabase/migrations/20260901000000_init.sql`. Crea tablas, índices únicos, triggers (recuento de votos válidos, perfil automático al registrar un usuario), políticas RLS, la publicación Realtime para `dishes`, el bucket `dish-images` y la vista `dish_stats`. Es idempotente: se puede volver a ejecutar. Dos opciones:

   - **SQL Editor** del Dashboard: abre el archivo, pega todo su contenido y ejecútalo.
   - **CLI** (incluida como dependencia de desarrollo), con la cadena de conexión del *Session pooler* (Dashboard → Connect):

     ```bash
     npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
     ```

     Si la CLI pide un `supabase/config.toml`, créalo con `npx supabase init` (no toca las migraciones) y repite el comando.

3. **Carga los datos demo** (opcional, pero recomendable para evaluar la propuesta):

   ```bash
   npm run seed
   ```

   Requiere `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. El script es idempotente y crea:

   - **Usuarios en Supabase Auth**: el admin y una cuenta por restaurante, con correo confirmado y el rol en `app_metadata`.
   - **Perfiles** (`profiles`) con rol y restaurante asignado.
   - **Restaurantes** y **platos**, subiendo cada foto de `public/demo/` al bucket `dish-images` (`dishes/<id>.jpg`).
   - **Ajustes** del festival (fila única `settings`).
   - **Votos demo** en `votes` y `vote_attempts`, solo para platos que todavía no tienen votos.

   Con `npm run seed -- --reset-passwords` se restablece la contraseña `demo1234` en las cuentas que ya existan (útil si la cambiaste). Al terminar imprime las credenciales.

4. **Arranca**:

   ```bash
   npm run dev
   ```

   Abre `http://localhost:3000` (público) y `http://localhost:3000/login` (panel). `GET /api/health` debe responder `{ "mode": "supabase" }`.

Para crear cuentas nuevas fuera del seed: añade el usuario en Dashboard → Authentication → Users; el trigger `handle_new_user` crea su perfil (rol `restaurant` por defecto, o el que indique `app_metadata.role`) y desde `/admin/restaurantes` el admin le asigna rol y restaurante.

## 5. Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compilación de producción |
| `npm run start` | Sirve la compilación de producción |
| `npm run lint` | ESLint (configuración de Next) |
| `npm run test` | Pruebas unitarias con Vitest: motor antifraude, reto firmado, cookie, señales y capa en memoria |
| `npm run test:watch` | Vitest en modo interactivo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Carga los datos demo en Supabase (acepta `-- --reset-passwords`) |

## 6. Estructura del proyecto

```
src/
├── proxy.ts                     # Proxy de Next 16 (antes middleware): siembra la cookie bl_vid,
│                                #   refresca la sesión de Supabase, protege /admin, cabeceras de seguridad
├── app/
│   ├── layout.tsx               # Layout raíz, metadatos, script de tema sin parpadeo
│   ├── page.tsx                 # Portada: hero + podio + ranking + "Cómo votamos"
│   ├── plato/[id]/page.tsx      # Página de plato (historia, ingredientes, votación)
│   ├── login/                   # Formulario y acción de inicio de sesión
│   ├── admin/                   # Panel: resumen, platos, restaurantes, votos, ajustes (server actions)
│   └── api/                     # Route handlers de la API pública (ver sección 7)
│       ├── _lib/http.ts         #   respuestas JSON sin caché, errores con código
│       ├── dishes/              #   GET lista, GET detalle, POST voto
│       ├── vote/challenge/      #   POST reto firmado
│       ├── settings/            #   GET ajustes públicos
│       └── health/              #   GET modo activo (memory | supabase)
├── components/
│   ├── public/                  # Hero, Leaderboard, DishCard, DishVotePanel, VoteButton,
│   │                            #   useLiveDishUpdates (Realtime o polling), Header, Footer…
│   ├── admin/                   # Formularios de plato/restaurante/ajustes, revisión de votos,
│   │                            #   asignación de cuentas, tabla, badges…
│   └── ui/                      # Button, Badge, GlassCard, ThemeToggle
└── lib/
    ├── antifraud/               # engine.ts (motor puro), signals.ts (derivación y HMAC),
    │                            #   challenge.ts, cookie.ts, hash.ts, turnstile.ts,
    │                            #   vote-service.ts (orquestación con I/O), *.test.ts
    ├── fingerprint/             # Recolector de huella en el navegador (client.ts, components.ts)
    ├── db/                      # index.ts elige implementación: memory.ts o supabase.ts;
    │                            #   types.ts (interfaz Db), demo-votes.ts, demo-ids.ts
    ├── auth/                    # Sesión y guardas (Supabase Auth o cookie demo firmada)
    ├── supabase/                # Clientes: navegador, servidor (cookies), admin (service role), proxy
    ├── seed-data.ts             # Restaurantes, platos, ajustes y cuentas demo (fuente única)
    ├── images.ts                # Qué URLs pasan por next/image
    └── types.ts                 # Tipos de dominio y contratos de la API

supabase/migrations/20260901000000_init.sql   # Esquema, RLS, triggers, Realtime, Storage
scripts/seed.ts                               # Carga de datos demo en Supabase
public/demo/                                  # 14 fotos de ejemplo
```

## 7. API pública

Todas las respuestas son JSON con `Cache-Control: no-store`. Los errores tienen la forma `{ "ok": false, "code": "...", "message": "..." }`, con `message` ya redactado para mostrar al usuario. No requiere autenticación; la votación se protege con la cookie, el reto firmado y el motor antifraude.

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| `GET` | `/api/health` | Modo de datos activo | `200 { ok: true, mode: "memory" \| "supabase" }` |
| `GET` | `/api/settings` | Ajustes públicos del festival (nombre, edición, lema, votación abierta); no expone umbrales antifraude | `200` |
| `GET` | `/api/dishes` | Platos publicados con su restaurante, ordenados por votos válidos | `200 { dishes: [...] }` |
| `GET` | `/api/dishes/:id` | Un plato publicado | `200 { dish }` · `404 DISH_NOT_FOUND` |
| `POST` | `/api/vote/challenge` | Body `{ dishId, fp }`. Emite el reto firmado (10 min) e indica si este votante ya votó el plato y si la votación está abierta. Siembra la cookie si falta | `200 { challenge, ttl, alreadyVoted, votingOpen }` · `400 BAD_REQUEST` · `404 DISH_NOT_FOUND` |
| `POST` | `/api/dishes/:id/vote` | Body `{ challenge, fp, turnstileToken? }`. Registra el voto | `200 { ok: true, status: "valid" \| "suspect", votes_count }` · `400 BAD_REQUEST` · `403 BAD_CHALLENGE` / `VOTING_CLOSED` / `CAPTCHA_REQUIRED` / `CAPTCHA_FAILED` · `404 DISH_NOT_FOUND` · `409 ALREADY_VOTED` · `429 RATE_LIMITED` |

Un error interno responde `500` con código `BAD_REQUEST` y un mensaje neutro; la causa queda en el log del servidor.

## 8. Despliegue

### Vercel

1. Importa el repositorio y define las variables de entorno de la sección 4: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VOTE_SECRET` y, si quieres captcha, las dos de Turnstile. Añade `NEXT_PUBLIC_SITE_URL` con el dominio final para que las imágenes de Open Graph tengan URL absoluta.
2. **`VOTE_SECRET` es obligatorio en producción**: si falta, la app lanza un error al firmar cookies o retos. Usa un valor largo y aleatorio (ver comando en la sección 4) y no lo cambies una vez abierta la votación, porque los hashes de votos ya registrados dejarían de coincidir con los nuevos.
3. **IP del cliente.** El servidor lee `x-forwarded-for` (primer valor), `x-real-ip` y `cf-connecting-ip`, y el país de `x-vercel-ip-country` o `cf-ipcountry`. Confía en esas cabeceras **solo** cuando la app esté detrás de Vercel o Cloudflare, que las sobreescriben. Si la despliegas en otro sitio sin un proxy que las fije, un cliente podría enviarlas a mano y esquivar el límite por IP (las demás señales seguirían funcionando).
4. **Turnstile (opcional).** Crea un widget en Cloudflare, pon la clave de sitio en `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y la secreta en `TURNSTILE_SECRET_KEY`. Con la secreta definida, cada voto exige un token válido (`CAPTCHA_REQUIRED` / `CAPTCHA_FAILED`).
5. La subida de imágenes va por server actions con límite de cuerpo de 6 MB (`next.config.ts`); el bucket acepta hasta 5 MB por archivo.

### Supabase

- **Realtime.** El ranking en vivo se suscribe a cambios `UPDATE` en `public.dishes`. La migración añade esa tabla a la publicación `supabase_realtime`; si la vista pública muestra "sondeo" en lugar de "en vivo", comprueba en Dashboard → Database → Publications que `dishes` esté incluida. Sin Realtime la app sigue funcionando con sondeo cada 8 s.
- **Storage.** La migración crea el bucket **`dish-images` como público** (lectura anónima, 5 MB, JPEG/PNG/WebP/AVIF). Las subidas las hace el servidor con service role tras comprobar la propiedad del plato; no hay política de escritura para clientes. `next.config.ts` permite optimizar imágenes de `*.supabase.co` y del origen de `NEXT_PUBLIC_SUPABASE_URL` (incluido un Supabase local o autoalojado).
- **Seguridad.** RLS está activo en todas las tablas: el público solo lee platos publicados, restaurantes y ajustes; nadie inserta votos desde el cliente; los restaurantes ven únicamente los votos de sus platos. La service role solo existe en el servidor (`server-only`).

## 9. Limitaciones y decisiones honestas

- **Sin autenticación no hay identidad perfecta.** Un atacante con muchos dispositivos físicos distintos, en redes distintas y con tiempo puede votar varias veces. El objetivo es que el coste sea alto y que los intentos queden trazados y en cuarentena, no prometer un cero absoluto.
- **Dos dispositivos idénticos** (mismo modelo, sistema, navegador e idioma) en la misma red pueden colisionar. Con `strict_device_match = true` (por defecto) el segundo recibe "ya votaste"; con `false` el voto entra en cuarentena con riesgo +45 para revisión manual. Es una decisión del organizador: menos falsos positivos a cambio de más votos que revisar.
- **La IP es una señal débil.** En el wifi del festival o en redes móviles con CGNAT una sola IP agrupa a miles de personas. Por eso solo suma riesgo y solo bloquea con límites altos (8 votos por plato y día por defecto, ajustables desde el panel).
- **La huella depende del navegador.** Modos privados estrictos, bloqueadores agresivos o navegadores headless devuelven huellas pobres; el sistema no los rechaza de entrada, pero les suma riesgo y suelen acabar en cuarentena. La revisión humana forma parte del diseño.
- **El modo demo no persiste.** Sirve para evaluar la propuesta y desarrollar; cualquier uso real requiere Supabase.

## 10. Créditos

- Fotos de ejemplo en `public/demo/`: [Unsplash](https://unsplash.com), bajo la [licencia Unsplash](https://unsplash.com/license). Son solo para la demo; sustitúyelas por las fotos reales de cada restaurante.
- Iconos: [Lucide](https://lucide.dev) (`lucide-react`), licencia ISC.
- Tipografía: Inter, vía `next/font`.
