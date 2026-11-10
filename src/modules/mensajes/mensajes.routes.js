import { crearNotificacion } from "../notificaciones/notificaciones.service.js";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";

export const mensajesRouter = Router();
mensajesRouter.use(requerirSesion);
const ids = z.object({ estudianteId: z.string().min(1).max(100), tutorId: z.string().min(1).max(100) }).strict();
async function participante(req, datos) {
  const { userId, user } = req.authSession;
  if (!((user.role === "student" && userId === datos.estudianteId) || (user.role === "tutor" && userId === datos.tutorId))) throw new HttpError(403, "No tienes acceso a esta conversación.");
  const booking = await prisma.booking.findFirst({ where: { studentId: datos.estudianteId, tutorId: datos.tutorId }, select: { id: true } });
  if (!booking) throw new HttpError(404, "No encontramos una reserva con este contacto.");
}
function validar(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Revisa los datos de la conversación.");
  return parsed.data;
}
mensajesRouter.get("/contactos", async (req, res) => {
  const esTutor = req.authSession.user.role === "tutor";
  const reservas = await prisma.booking.findMany({
    where: esTutor ? { tutorId: req.authSession.userId } : { studentId: req.authSession.userId },
    select: { tutorId: true, studentId: true, startsAt: true, subject: { select: { name: true } },
      tutor: { select: { professionalTitle: true, user: { select: { name: true } } } }, student: { select: { user: { select: { name: true } } } } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
  const contactos = new Map();
  for (const r of reservas) {
    const id = esTutor ? r.studentId : r.tutorId;
    if (!contactos.has(id)) contactos.set(id, { tutorId: r.tutorId, estudianteId: r.studentId, nombre: esTutor ? r.student.user.name : r.tutor.user.name, titulo: esTutor ? "Estudiante" : r.tutor.professionalTitle, motivo: `${r.subject.name} · ${new Date(r.startsAt.getTime() - 5 * 3600000).toISOString().slice(0, 10)}` });
  }
  res.set("Cache-Control", "no-store").json([...contactos.values()]);
});
mensajesRouter.get("/hilo", async (req, res) => {
  const datos = validar(ids, req.query);
  await participante(req, datos);
  const conversacion = await prisma.conversation.findUnique({ where: { studentId_tutorId: { studentId: datos.estudianteId, tutorId: datos.tutorId } }, include: { messages: { orderBy: [{ sentAt: "asc" }, { id: "asc" }] } } });
  res.set("Cache-Control", "no-store").json({ mensajes: (conversacion?.messages ?? []).map((m) => ({ id: m.id, conversacionId: m.conversationId, autorId: m.authorId, texto: m.text, enviadoEn: m.sentAt.toISOString(), leido: m.isRead })) });
});
mensajesRouter.post("/hilo/leer", async (req, res) => {
  const datos = validar(ids, req.body);
  await participante(req, datos);
  await prisma.message.updateMany({ where: { conversation: { studentId: datos.estudianteId, tutorId: datos.tutorId }, authorId: { not: req.authSession.userId }, isRead: false }, data: { isRead: true } });
  res.sendStatus(204);
});
mensajesRouter.post("/", async (req, res) => {
  const datos = validar(ids.extend({ texto: z.string().trim().min(1).max(1000) }), req.body);
  await participante(req, datos);
  const mensaje = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${datos.tutorId} FOR UPDATE`;
    const conversacion = await tx.conversation.upsert({ where: { studentId_tutorId: { studentId: datos.estudianteId, tutorId: datos.tutorId } }, create: { id: `c-${randomUUID()}`, studentId: datos.estudianteId, tutorId: datos.tutorId, lastActivityAt: new Date() }, update: { lastActivityAt: new Date() } });
    await crearNotificacion(tx, { destinatarioId: req.authSession.userId === datos.tutorId ? datos.estudianteId : datos.tutorId, tipo: "new_message", titulo: "Tienes un mensaje nuevo", detalle: datos.texto.slice(0, 100), enlace: req.authSession.userId === datos.tutorId ? "/estudiante/mensajes" : "/tutor/mensajes" });
    return tx.message.create({ data: { id: `m-${randomUUID()}`, conversationId: conversacion.id, authorId: req.authSession.userId, text: datos.texto }, select: { id: true } });
  });
  res.status(201).json(mensaje);
});
