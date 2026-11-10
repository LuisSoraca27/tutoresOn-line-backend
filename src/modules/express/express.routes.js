import { crearNotificacion } from "../notificaciones/notificaciones.service.js";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";
import { obtener as tutorPublico } from "../tutores/tutores.service.js";
import { avisarCambio, crearTicket, tutoresConectados } from "./realtime.js";

export const expressRouter = Router();
expressRouter.use(requerirSesion);
const VIGENCIA = 5 * 60 * 1000;
const roles = (req, rol) => { if (req.authSession.user.role !== rol) throw new HttpError(403, "No tienes acceso a esta acción."); };
const view = (r) => ({ id: r.id, estudianteId: r.studentId, materiaId: r.subjectId, nivelId: r.educationLevelId, modalidad: r.modality === "online" ? "virtual" : "presencial", duracionMinutos: r.durationMinutes, nota: r.note ?? undefined, estado: { searching: "buscando", matched: "emparejada", cancelled: "cancelada", expired: "expirada" }[r.status], tutorId: r.tutorId ?? undefined, reservaId: r.bookingId ?? undefined, creadaEn: r.createdAt.toISOString() });
async function expirar() {
  const r = await prisma.instantTutoringRequest.updateMany({ where: { status: "searching", createdAt: { lte: new Date(Date.now() - VIGENCIA) } }, data: { status: "expired" } });
  if (r.count) avisarCambio();
}
async function candidatos(r) {
  const conectados = tutoresConectados();
  if (!conectados.length) return [];
  return prisma.tutor.findMany({ where: { userId: { in: conectados }, modality: { in: ["online", "both"] }, subjects: { some: { subjectId: r.subjectId, levels: { some: { educationLevelId: r.educationLevelId } } } } }, select: { userId: true, user: { select: { name: true } } } });
}
expressRouter.post("/ticket", (req, res) => res.set("Cache-Control", "no-store").json({ ticket: crearTicket(req.authSession) }));
expressRouter.post("/", async (req, res) => {
  roles(req, "student");
  const parsed = z.object({ materiaId: z.string().min(1).max(100), nivelId: z.string().min(1).max(100), modalidad: z.literal("virtual"), duracionMinutos: z.union([z.literal(30), z.literal(60), z.literal(90)]), nota: z.string().trim().max(1000).optional() }).strict().safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Revisa la materia, el nivel y la modalidad virtual.");
  const d = parsed.data;
  const r = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM students WHERE user_id = ${req.authSession.userId} FOR UPDATE`;
    await tx.instantTutoringRequest.updateMany({ where: { studentId: req.authSession.userId, status: "searching", createdAt: { lte: new Date(Date.now() - VIGENCIA) } }, data: { status: "expired" } });
    if (await tx.instantTutoringRequest.findFirst({ where: { studentId: req.authSession.userId, status: "searching" } })) throw new HttpError(409, "Ya tienes una búsqueda en curso.");
    if (!(await tx.subject.findUnique({ where: { id: d.materiaId } })) || !(await tx.educationLevel.findUnique({ where: { id: d.nivelId } }))) throw new HttpError(400, "Selecciona una materia y nivel válidos.");
    return tx.instantTutoringRequest.create({ data: { id: `ex-${randomUUID()}`, studentId: req.authSession.userId, subjectId: d.materiaId, educationLevelId: d.nivelId, modality: "online", durationMinutes: d.duracionMinutos, note: d.nota } });
  });
  const timer = setTimeout(() => { expirar().catch((error) => console.error("No se pudo vencer la solicitud:", error)); }, VIGENCIA + 100);
  timer.unref();
  avisarCambio();
  res.status(201).json(view(r));
});
expressRouter.get("/activa", async (req, res) => {
  roles(req, "student"); await expirar();
  const r = await prisma.instantTutoringRequest.findFirst({ where: { studentId: req.authSession.userId, status: "searching" }, orderBy: { createdAt: "desc" } });
  res.set("Cache-Control", "no-store").json(r ? view(r) : null);
});
expressRouter.get("/", async (req, res) => {
  roles(req, "tutor"); await expirar();
  if (!tutoresConectados().includes(req.authSession.userId)) return res.json([]);
  const tutor = await prisma.tutor.findUnique({ where: { userId: req.authSession.userId }, include: { subjects: { include: { levels: true } } } });
  if (!tutor || !["online", "both"].includes(tutor.modality)) return res.json([]);
  const rows = await prisma.instantTutoringRequest.findMany({ where: { status: "searching", modality: "online" }, include: { student: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } });
  res.set("Cache-Control", "no-store").json(rows.filter((r) => tutor.subjects.some((s) => s.subjectId === r.subjectId && s.levels.some((n) => n.educationLevelId === r.educationLevelId))).map((r) => ({ ...view(r), estudianteNombre: r.student.user.name })));
});
expressRouter.get("/:id", async (req, res) => {
  roles(req, "student"); await expirar();
  const r = await prisma.instantTutoringRequest.findFirst({ where: { id: req.params.id, studentId: req.authSession.userId } });
  if (!r) throw new HttpError(404, "No encontramos esa búsqueda.");
  const lista = r.status === "searching" ? await candidatos(r) : [];
  res.set("Cache-Control", "no-store").json({ solicitud: view(r), candidatos: lista.map((t) => ({ id: t.userId, nombre: t.user.name })), tutor: r.tutorId ? await tutorPublico(r.tutorId) : null });
});
expressRouter.post("/:id/cancelar", async (req, res) => {
  roles(req, "student"); await expirar();
  const changed = await prisma.instantTutoringRequest.updateMany({ where: { id: req.params.id, studentId: req.authSession.userId, status: "searching" }, data: { status: "cancelled" } });
  if (!changed.count) {
    const existing = await prisma.instantTutoringRequest.findFirst({ where: { id: req.params.id, studentId: req.authSession.userId } });
    if (!existing) throw new HttpError(404, "No encontramos esa búsqueda.");
    throw new HttpError(409, "La búsqueda ya terminó. Revisa su estado.");
  }
  avisarCambio(); res.sendStatus(204);
});
expressRouter.post("/:id/tomar", async (req, res) => {
  roles(req, "tutor");
  if (!tutoresConectados().includes(req.authSession.userId)) throw new HttpError(409, "Activa tu disponibilidad para tomar solicitudes.");
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${req.authSession.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM instant_tutoring_requests WHERE id = ${req.params.id} FOR UPDATE`;
    const solicitud = await tx.instantTutoringRequest.findUnique({ where: { id: req.params.id } });
    if (!solicitud || solicitud.status !== "searching" || solicitud.createdAt.getTime() <= Date.now() - VIGENCIA) throw new HttpError(409, "La solicitud ya no está disponible.");
    if (!tutoresConectados().includes(req.authSession.userId)) throw new HttpError(409, "Ya no estás conectado al modo inmediato.");
    const tutor = await tx.tutor.findUnique({ where: { userId: req.authSession.userId }, include: { subjects: { where: { subjectId: solicitud.subjectId }, include: { levels: true } }, schedulingRules: true } });
    const materia = tutor?.subjects[0];
    if (!tutor || !["online", "both"].includes(tutor.modality) || solicitud.modality !== "online" || !materia?.levels.some((n) => n.educationLevelId === solicitud.educationLevelId)) throw new HttpError(403, "Esta solicitud no coincide con tu oferta.");
    const inicio = new Date(Date.now() + 5 * 60000), fin = new Date(inicio.getTime() + solicitud.durationMinutes * 60000);
    const pausa = (tutor.schedulingRules?.breakMinutes ?? 15) * 60000;
    if (await tx.booking.findFirst({ where: { tutorId: tutor.userId, status: { in: ["pending", "accepted", "in_progress"] }, startsAt: { lt: new Date(fin.getTime() + pausa) }, endsAt: { gt: new Date(inicio.getTime() - pausa) } } })) throw new HttpError(409, "El horario se cruza con una reserva de tu agenda.");
    const reserva = await tx.booking.create({ data: { id: `r-${randomUUID()}`, tutorId: tutor.userId, studentId: solicitud.studentId, subjectId: solicitud.subjectId, educationLevelId: solicitud.educationLevelId, modality: "online", startsAt: inicio, endsAt: fin, durationMinutes: solicitud.durationMinutes, price: Math.round(Number(materia.hourlyRate) * solicitud.durationMinutes / 60), studentNote: solicitud.note, status: "accepted" } });
    await crearNotificacion(tx, { destinatarioId: solicitud.studentId, tipo: "booking_accepted", titulo: "Un tutor aceptó tu solicitud", detalle: "Tu sesión inmediata está confirmada.", enlace: "/estudiante/reservas" });
    return tx.instantTutoringRequest.update({ where: { id: solicitud.id }, data: { status: "matched", tutorId: tutor.userId, bookingId: reserva.id } });
  });
  avisarCambio(); res.json(view(resultado));
});
