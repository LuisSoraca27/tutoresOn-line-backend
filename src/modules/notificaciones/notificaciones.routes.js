import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
export const notificacionesRouter = Router();
notificacionesRouter.use(requerirSesion);
const tipos = { new_booking: "reserva-nueva", booking_accepted: "reserva-aceptada", booking_rejected: "reserva-rechazada", booking_cancelled: "reserva-cancelada", booking_rescheduled: "reserva-reprogramada", new_message: "mensaje-nuevo", session_completed: "sesion-finalizada", new_review: "resena-nueva", review_replied: "resena-respondida" };
notificacionesRouter.get("/", async (req, res) => {
  const rows = await prisma.notification.findMany({ where: { recipientId: req.authSession.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  res.set("Cache-Control", "no-store").json(rows.map((n) => ({ id: n.id, destinatarioId: n.recipientId, tipo: tipos[n.type], titulo: n.title, detalle: n.detail, enlace: n.link, leida: n.isRead, creadaEn: n.createdAt.toISOString() })));
});
notificacionesRouter.get("/sin-leer", async (req, res) => {
  const count = await prisma.notification.count({ where: { recipientId: req.authSession.userId, isRead: false } });
  res.set("Cache-Control", "no-store").json(count);
});
notificacionesRouter.post("/leidas", async (req, res) => {
  await prisma.notification.updateMany({ where: { recipientId: req.authSession.userId, isRead: false }, data: { isRead: true } });
  res.sendStatus(204);
});
