import { app } from "./app.js";
import { config } from "./config/env.js";
import { prisma } from "./database/prisma.js";
import { conectarRealtime } from "./modules/express/realtime.js";

const server = app.listen(config.puerto, () => {
  console.log(`API disponible en http://localhost:${config.puerto}/api/v1`);
});
const cerrarRealtime = conectarRealtime(server);

async function cerrar(signal) {
  console.log(`${signal}: cerrando el servidor`);
  cerrarRealtime();
  server.close(async (error) => {
    try { await prisma.$disconnect(); } catch (disconnectError) { console.error(disconnectError); process.exitCode = 1; }
    if (error) { console.error(error); process.exitCode = 1; }
  });
}
process.once("SIGINT", cerrar);
process.once("SIGTERM", cerrar);
