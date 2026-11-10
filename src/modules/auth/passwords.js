import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export async function hashClave(clave) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(clave, salt, 64);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verificarClave(clave, guardada) {
  const [, salt, digest] = (guardada ?? "").split(":");
  const valido = /^[a-f0-9]{32}$/.test(salt ?? "") && /^[a-f0-9]{128}$/.test(digest ?? "");
  const obtenido = await scrypt(clave, valido ? salt : "00000000000000000000000000000000", 64);
  const esperado = Buffer.from(valido ? digest : "00".repeat(64), "hex");
  return valido && timingSafeEqual(obtenido, esperado);
}
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
