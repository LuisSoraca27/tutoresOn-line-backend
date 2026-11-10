# Backend · TutoresOn-Line

API HTTP en Express 5 con módulos ES, PostgreSQL y Prisma. Requiere Node.js
22.18 o superior. Es el paquete `@tutores-online/backend` del workspace npm;
instala las dependencias con `npm ci` en la raíz del repositorio.

## Estructura

```text
backend/
  src/
    app.js                 # Express, sin abrir un puerto
    server.js              # Inicio y cierre del servidor
    config/env.js          # Variables de entorno y validación
    database/prisma.js     # Cliente Prisma para PostgreSQL
    middleware/            # CORS y errores HTTP
    routes/                # Rutas de la API /api/v1
    modules/
      auth/                # Validación, rutas, sesiones y lógica de cuentas
      catalogos/           # Rutas y consultas de catálogos
  prisma/                  # Esquema, migraciones y datos iniciales
  tests/                   # Pruebas HTTP y de integración con PostgreSQL
```

## Configuración y ejecución

Desde la raíz, con Docker Desktop iniciado:

```bash
npm ci
docker compose up -d --wait
npm run db:setup
npm run db:seed:demo
npm run backend:dev
```

El seed demo es opcional y no sobrescribe cuentas. `db:setup` genera el cliente
de Prisma, aplica las migraciones pendientes y carga los catálogos. La API
escucha en `http://localhost:8000/api/v1`. También se puede trabajar desde
`backend/` usando `npm run dev`, `npm run start` y los comandos `db:*` de su
`package.json`.

Copia `backend/.env.example` a `backend/.env` para cambiar `PORT`,
`FRONTEND_ORIGIN` o `DATABASE_URL`. Las variables del entorno tienen prioridad.
Sin archivo se usan los valores del ejemplo para desarrollo local;
`DATABASE_URL` es obligatoria en producción. Las credenciales de ejemplo son
solo para desarrollo. El frontend usa su propio `.env.local`.

## Fotos en Cloudflare R2

Configura en `backend/.env` el endpoint S3 de R2, el nombre del bucket y las
credenciales mediante `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID` y
`R2_SECRET_ACCESS_KEY`. El token necesita permisos de lectura, escritura y
eliminación de objetos en ese bucket. Mantén estas credenciales solo en el
servidor y fuera de Git. El bucket puede ser privado: la API entrega las fotos
públicas a través de `GET /api/v1/tutores/:id/foto`.

Las fotos nuevas se guardan en R2; PostgreSQL conserva la clave del objeto.
Las fotos antiguas guardadas como datos en PostgreSQL siguen funcionando y se
reemplazan por R2 cuando el tutor sube otra. Al reemplazar o quitar una foto,
se intenta borrar el objeto anterior; si falla, se registra para su limpieza.
Sin configuración de R2, la subida devuelve un error y no modifica el perfil.

## API implementada

- `GET /api/v1/health`: estado del proceso.
- `GET /api/v1/catalogos/{materias,niveles,ciudades}`: catálogos.
- `GET /api/v1/tutores`, `GET /api/v1/tutores/destacados` y
  `GET /api/v1/tutores/:id`: búsqueda, destacados y perfil público.
- `PUT /api/v1/tutores/:id/materias`: actualiza la oferta del tutor autenticado.
- `PUT /api/v1/tutores/:id/cobertura`: actualiza modalidad y cobertura del tutor autenticado.
- `PUT /api/v1/tutores/:id/presentacion` y `PUT /api/v1/tutores/:id/foto`:
  editan la presentación y la foto del tutor autenticado.
- `GET /api/v1/solicitudes` y `PATCH /api/v1/solicitudes/:id`: consulta y
  respuesta a solicitudes del tutor autenticado.
- `GET /api/v1/agenda?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`: sesiones activas
  del tutor autenticado, en hora de Bogotá.
- `GET /api/v1/ingresos`: valores de sesiones finalizadas con asistencia del
  tutor autenticado; admite los filtros opcionales `desde` y `hasta`.
  Estos valores no acreditan pagos ni habilitan retiros.
- `GET /api/v1/historial`: reservas y cierres del tutor autenticado, ordenados
  por fecha de sesión y expresados en hora de Bogotá.
- `GET /api/v1/mensajes/contactos`, `GET /api/v1/mensajes/hilo`,
  `POST /api/v1/mensajes` y `POST /api/v1/mensajes/hilo/leer`: mensajería
  entre los participantes de una reserva.
- `GET /api/v1/favoritos` y `PUT` o `DELETE /api/v1/favoritos/:tutorId`:
  tutores guardados por el estudiante autenticado.
- `/api/v1/express`: solicitudes inmediatas virtuales. El cliente obtiene un
  ticket temporal autenticado mediante `POST /express/ticket` y abre
  `/express/socket` para recibir actualizaciones por WebSocket. El tutor debe
  mantener abierto su panel y activar «Tutor al instante».

Las conexiones y la presencia del modo inmediato se mantienen en memoria del
proceso del backend. Para múltiples instancias hace falta un mecanismo de
presencia y difusión compartido; las solicitudes y reservas sí se guardan en
PostgreSQL. El proxy de producción debe permitir la actualización HTTP a
WebSocket y `FRONTEND_ORIGIN` debe coincidir con el origen del navegador.
- `GET /api/v1/tutores/:id/disponibilidad` y `GET /api/v1/tutores/:id/turnos`:
  horario y turnos disponibles; el tutor puede editar su horario mediante
  `PUT /api/v1/tutores/:id/disponibilidad/{bloques,reglas,excepciones}`.
- `POST /api/v1/reservas` y `GET /api/v1/reservas/mias`: creación y consulta
  de reservas del estudiante autenticado.
- `POST /api/v1/reservas/:id/cancelar`, `GET /api/v1/reservas/:id/turnos` y
  `PATCH /api/v1/reservas/:id/reprogramar`: gestión de reservas futuras del estudiante.
- `GET /api/v1/tutores/:id/resenas`, `POST /api/v1/resenas` y
  `PUT /api/v1/resenas/:id/respuesta`: reseñas públicas, creación por el
  estudiante tras una sesión finalizada con asistencia y respuesta del tutor.
- `POST /api/v1/auth/registro/{estudiante,tutor}`: crea cuenta y sesión.
- `POST /api/v1/auth/login`: inicia sesión.
- `GET /api/v1/auth/correo-disponible`: consulta un correo.
- `GET /api/v1/auth/me`, `PATCH /api/v1/auth/me` y
  `POST /api/v1/auth/logout`: requieren el token de sesión como Bearer.

Las contraseñas se guardan con scrypt y los tokens de sesión se guardan como
hash; las sesiones vencen a los siete días. Otros módulos del frontend,
como notificaciones y cierre de sesiones, aún usan datos simulados. La recuperación
de contraseña aún no está implementada.

## Verificación

`npm test` en la raíz ejecuta las pruebas del frontend y del backend. Las
pruebas de integración de autenticación requieren PostgreSQL, migraciones y
catálogos, y se habilitan con `TEST_DATABASE_AUTH=1`. En PowerShell:

```powershell
$env:TEST_DATABASE_AUTH = "1"
npm test --workspace @tutores-online/backend
Remove-Item Env:TEST_DATABASE_AUTH
```

Las cuentas usadas por esta prueba se crean con identificadores únicos y se
eliminan al terminar. Para crear una migración durante el desarrollo usa
`npm run db:migrate -- --name descripcion` desde la raíz. La base local previa
SQLite no se migra automáticamente.
