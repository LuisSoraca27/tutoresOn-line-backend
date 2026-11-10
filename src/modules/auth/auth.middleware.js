import { HttpError } from "../../middleware/errors.js";
import { obtenerSesion } from "./auth.service.js";

export async function requerirSesion(req, _res, next) {
  const token = req.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new HttpError(401, "Sesión inválida o expirada.");
  const registro = await obtenerSesion(token);
  if (!registro) throw new HttpError(401, "Sesión inválida o expirada.");
  req.authSession = registro;
  next();
}
