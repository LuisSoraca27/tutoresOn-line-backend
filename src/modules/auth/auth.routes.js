import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { HttpError } from "../../middleware/errors.js";
import { requerirSesion } from "./auth.middleware.js";
import { correoSchema, estudianteSchema, loginSchema, perfilSchema, tutorSchema } from "./auth.schemas.js";
import * as auth from "./auth.service.js";

export const authRouter = Router();
const limitar = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  message: { detail: "Demasiados intentos. Inténtalo más tarde." },
});
function validar(schema, valor, mensaje) {
  const resultado = schema.safeParse(valor);
  if (!resultado.success) throw new HttpError(400, mensaje);
  return resultado.data;
}

authRouter.post("/login", limitar, async (req, res) => {
  const datos = validar(loginSchema, req.body, "Revisa el correo y la contraseña.");
  res.set("Cache-Control", "no-store").json(await auth.iniciarSesion(datos));
});
authRouter.post("/registro/:rol", limitar, async (req, res) => {
  const { rol } = req.params;
  if (!["estudiante", "tutor"].includes(rol)) throw new HttpError(404, "Ruta no encontrada.");
  const datos = validar(rol === "tutor" ? tutorSchema : estudianteSchema, req.body, "Revisa los datos del registro.");
  res.status(201).set("Cache-Control", "no-store").json(await auth.registrar(rol, datos));
});
authRouter.get("/correo-disponible", limitar, async (req, res) => {
  const correo = validar(correoSchema, req.query.correo, "Correo inválido.");
  res.json(await auth.correoDisponible(correo));
});
authRouter.get("/me", requerirSesion, (req, res) => {
  res.set("Cache-Control", "no-store").json(auth.vistaUsuario(req.authSession.user));
});
authRouter.post("/logout", requerirSesion, async (req, res) => {
  await auth.cerrarSesion(req.authSession.tokenHash);
  res.sendStatus(204);
});
authRouter.patch("/me", requerirSesion, async (req, res) => {
  const datos = validar(perfilSchema, req.body, "Revisa los datos del perfil.");
  res.set("Cache-Control", "no-store").json(await auth.actualizarPerfil(req.authSession.userId, datos));
});
