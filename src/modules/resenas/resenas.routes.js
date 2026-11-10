import { crearNotificacion } from "../notificaciones/notificaciones.service.js";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { HttpError } from "../../middleware/errors.js";
import { requerirSesion } from "../auth/auth.middleware.js";

export const resenasRouter = Router();
resenasRouter.get("/tutores/:id/resenas", async (req, res) => {
  const rows = await prisma.review.findMany({
    where: { booking: { tutorId: req.params.id, status: "completed" } },
    select: { id: true, rating: true, comment: true, punctualityRating: true, clarityRating: true, subjectKnowledgeRating: true, tutorReply: true, createdAt: true, booking: { select: { student: { select: { user: { select: { name: true } } } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({
    id: r.id, estudianteNombre: r.booking.student.user.name, puntaje: r.rating, comentario: r.comment,
    criterios: r.punctualityRating !== null && r.clarityRating !== null && r.subjectKnowledgeRating !== null ? { puntualidad: r.punctualityRating, claridad: r.clarityRating, dominio: r.subjectKnowledgeRating } : null,
    respuestaTutor: r.tutorReply, creadaEn: r.createdAt.toISOString(),
  })));
});
const puntuacion = z.number().int().min(1).max(5);
const nueva = z.object({ reservaId: z.string().min(1).max(100), puntaje: puntuacion, comentario: z.string().trim().min(10).max(5000), criterios: z.object({ puntualidad: puntuacion, claridad: puntuacion, dominio: puntuacion }).strict().optional() }).strict();
resenasRouter.post("/resenas", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "student") throw new HttpError(403, "Solo los estudiantes pueden publicar reseñas.");
  const parsed = nueva.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Revisa la calificación y el comentario.");
  const d = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id: d.reservaId, studentId: req.authSession.userId }, include: { report: true } });
      if (!booking) throw new HttpError(404, "No encontramos esa reserva.");
      if (booking.status !== "completed" || !booking.report?.studentAttended) throw new HttpError(409, "Solo puedes calificar una sesión finalizada a la que asististe.");
      await tx.review.create({ data: { id: `review-${randomUUID()}`, bookingId: booking.id, rating: d.puntaje, comment: d.comentario, punctualityRating: d.criterios?.puntualidad, clarityRating: d.criterios?.claridad, subjectKnowledgeRating: d.criterios?.dominio } });
      await crearNotificacion(tx, { destinatarioId: booking.tutorId, tipo: "new_review", titulo: "Recibiste una reseña", detalle: `${d.puntaje} de 5 estrellas. Puedes responder públicamente.`, enlace: "/tutor/resenas" });
      return booking.tutorId;
    });
    res.status(201).json({ tutorId: result });
  } catch (error) {
    if (error.code === "P2002") throw new HttpError(409, "Esta sesión ya tiene una reseña.");
    throw error;
  }
});
resenasRouter.put("/resenas/:id/respuesta", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor") throw new HttpError(403, "Solo el tutor puede responder.");
  const parsed = z.object({ texto: z.string().trim().min(5).max(5000) }).strict().safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "La respuesta debe tener entre 5 y 5000 caracteres.");
  await prisma.$transaction(async (tx) => {
  const changed = await tx.review.updateMany({ where: { id: req.params.id, tutorReply: null, booking: { tutorId: req.authSession.userId, status: "completed" } }, data: { tutorReply: parsed.data.texto } });
  if (!changed.count) {
    const own = await tx.review.findFirst({ where: { id: req.params.id, booking: { tutorId: req.authSession.userId, status: "completed" } }, select: { id: true } });
    if (!own) throw new HttpError(404, "No encontramos esa reseña.");
    throw new HttpError(409, "Esta reseña ya tiene una respuesta.");
  }
  const review = await tx.review.findUnique({ where: { id: req.params.id }, select: { booking: { select: { studentId: true, tutorId: true } } } });
  await crearNotificacion(tx, { destinatarioId: review.booking.studentId, tipo: "review_replied", titulo: "Tu tutor respondió a tu reseña", detalle: parsed.data.texto.slice(0, 90), enlace: `/tutores/${review.booking.tutorId}` });
  });
  res.sendStatus(204);
});
