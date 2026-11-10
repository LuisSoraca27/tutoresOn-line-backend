import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { HttpError } from "../../middleware/errors.js";
import { requerirSesion } from "../auth/auth.middleware.js";

export const preferenciasRouter = Router();
const eventos = { "reserva-confirmada": "booking_confirmed", "recordatorio-sesion": "session_reminder", "cambio-de-estado": "status_changed", "resumen-sesion": "session_summary" };
const canales = { correo: "email", sms: "sms", whatsapp: "whatsapp" };
const esquema = z.object({ canales: z.object(Object.fromEntries(Object.keys(eventos).map((evento) => [evento, z.array(z.enum(["correo", "sms", "whatsapp"])).max(3).refine((valores) => new Set(valores).size === valores.length)]))).strict() }).strict();

preferenciasRouter.use("/:id/preferencias", requerirSesion, (req, _res, next) => {
  if (req.params.id !== req.authSession.userId) throw new HttpError(403, "No puedes consultar estas preferencias.");
  next();
});

preferenciasRouter.get("/:id/preferencias", async (req, res) => {
  const filas = await prisma.notificationPreference.findMany({ where: { userId: req.authSession.userId } });
  const resultado = Object.fromEntries(Object.entries(eventos).map(([evento, valor]) => [evento, Object.entries(canales).filter(([, canal]) => {
    const fila = filas.find((item) => item.event === valor && item.channel === canal);
    return fila ? fila.enabled : canal === "email";
  }).map(([canal]) => canal)]));
  res.set("Cache-Control", "no-store").json({ usuarioId: req.authSession.userId, canales: resultado });
});

preferenciasRouter.put("/:id/preferencias", async (req, res) => {
  const validado = esquema.safeParse(req.body);
  if (!validado.success) throw new HttpError(400, "Revisa los canales de notificación elegidos.");
  const userId = req.authSession.userId;
  const operaciones = Object.entries(eventos).flatMap(([evento, valor]) => Object.entries(canales).map(([canal, channel]) => {
    const enabled = validado.data.canales[evento].includes(canal);
    return prisma.notificationPreference.upsert({ where: { userId_event_channel: { userId, event: valor, channel } }, create: { userId, event: valor, channel, enabled }, update: { enabled } });
  }));
  await prisma.$transaction(operaciones);
  res.set("Cache-Control", "no-store").json({ usuarioId: userId, canales: validado.data.canales });
});
