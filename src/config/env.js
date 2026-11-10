import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Se carga siempre el .env del backend, independientemente del directorio de inicio.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  FRONTEND_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.url().refine((url) => /^postgres(?:ql)?:\/\//.test(url)).optional(),
});
const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const campos = resultado.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Configuración del backend inválida: ${campos}`);
}
if (resultado.data.NODE_ENV === "production" && !resultado.data.DATABASE_URL) {
  throw new Error("DATABASE_URL es obligatoria en producción.");
}
export const config = {
  entorno: resultado.data.NODE_ENV,
  puerto: resultado.data.PORT,
  frontendOrigin: resultado.data.FRONTEND_ORIGIN,
  databaseUrl: resultado.data.DATABASE_URL ?? "postgresql://tutores:tutores_local@localhost:55432/tutores_online?schema=public",
};
