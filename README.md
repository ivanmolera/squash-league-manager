# Squash League Manager

Web app para gestionar ligas individuales, ligas por equipos, torneos, jugadores, clubes, resultados historicos y rankings de squash.

## Stack

- Next.js + TypeScript
- PostgreSQL en Cloud SQL
- Prisma como cliente tipado
- Flyway para versionar migraciones SQL
- Sesiones propias para email/password y Google OpenID Connect
- Cloud Run para despliegue
- Cloud Storage para fotos de perfil y logos

## Desarrollo local

1. Copia `.env.example` a `.env`.
2. Configura `DATABASE_URL`, `FLYWAY_URL`, `FLYWAY_USER` y `FLYWAY_PASSWORD`.
3. Ejecuta las migraciones:

```bash
npm run db:migrate
```

4. Genera el cliente Prisma:

```bash
npm run prisma:generate
```

5. Arranca la app:

```bash
npm run dev
```

## Acceso con Google

El acceso con Google es opcional y se activa al configurar `GOOGLE_OAUTH_CLIENT_ID` y
`GOOGLE_OAUTH_CLIENT_SECRET` en el servidor. Crea un cliente OAuth de tipo **Aplicación web**
en Google Auth Platform del proyecto `squash-league-ivan`. Añade
`https://squashflow.com/api/auth/google/callback` y
`https://www.squashflow.com/api/auth/google/callback` como URI de redirección autorizada,
y ambos orígenes como autorizados. Para desarrollo local, añade
`http://localhost:3000/api/auth/google/callback` y `http://localhost:3000`.
El valor de `APP_BASE_URL` debe coincidir con el dominio utilizado para iniciar el flujo.
Guarda el secreto del cliente en Secret Manager; no lo incluyas en Git ni en variables
`NEXT_PUBLIC_`.

Las cuentas existentes con Gmail/Google Workspace verificado se vinculan por email al
primer acceso. Las demás cuentas deben iniciar sesión con contraseña y vincular Google
desde su propia ficha. Las cuentas nuevas reciben el rol `player`; si existe una ficha
de jugador parecida, se genera una solicitud de vinculación para revisión administrativa.
Las cuentas suspendidas siguen sin poder acceder.

## Modelo de datos

La migracion inicial esta en `db/migrations/V1__initial_squash_domain.sql`.
La auditoria, autenticacion local inicial y nombres historicos estan en `db/migrations/V2__audit_auth_and_historical_names.sql`.

El diseno conserva historico mediante:

- temporadas con estado `draft`, `active` o `closed`
- membresias jugador-club por temporada
- plantillas jugador-equipo por temporada/categoria
- datos redundantes del club/equipo en el momento de cada partido
- snapshots de clasificaciones al cerrar temporadas
- auditoria de cambios administrativos

Ver `docs/data-model.md` para el resumen del dominio.

## Usuario de pruebas

El seed inicial crea:

- email: `ivan.molera@gmail.com`
- rol: `admin`

```bash
npm run seed:admin
```

## Despliegue

La app debe desplegarse en un proyecto de Google Cloud dedicado:

- Proyecto: `squash-league-ivan`
- Region: `europe-west1`
- Servicio Cloud Run: `squash-league-manager`
- Instancia Cloud SQL: `squash-league-db`
- Secreto `DATABASE_URL`: `squash-database-url`

No desplegar sobre `euclid-umap-app`, que pertenece a otra aplicacion y vive en otro proyecto.

El pipeline de Cloud Build reutiliza una imagen de dependencias en Artifact Registry para
evitar reinstalar paquetes y regenerar Prisma cuando no hayan cambiado. Para construir,
publicar y desplegar una revision con el 100 % del trafico ejecuta:

```bash
npm run deploy:gcp
```

## Avisos de competiciones

Los usuarios con email verificado y ficha deportiva activa pueden activar los avisos en
`La meva fitxa > Editar`. La preferencia empieza desactivada. El correo se envía una sola
vez por competición cuando faltan entre uno y siete días para su inicio, siempre que
el torneo admita inscripciones, el jugador ya esté inscrito, o pueda participar en una
liga. Se respetan las categorías por género, edad y nivel, la pertenencia a un club en
ligas locales y las categorías en las que el jugador ya está inscrito. El correo incluye fecha, lugar, categorías, plazo de inscripción
y enlace a la competición y a las preferencias. No se envía a cuentas suspendidas,
sin verificar o sin ficha deportiva activa.

En producción, configura `RESEND_API_KEY` desde Secret Manager, `EMAIL_FROM` con un
dominio de envío verificado, y `SCHEDULER_OIDC_AUDIENCE` con la URL principal de Cloud Run.
`SCHEDULER_SERVICE_ACCOUNT_EMAIL` debe ser la cuenta de servicio usada por Cloud Scheduler.
La tarea hace `POST /api/jobs/competition-alerts` diariamente a las 09:00 en
`Europe/Madrid` con un token OIDC para esa audiencia. `?dryRun=1` calcula destinatarios
sin registrar envíos ni mandar correos. Cada envío se registra en
`competition_alert_deliveries` para evitar duplicados y permitir reintentos.
