import { crearNotificacion } from "../notificaciones/notificaciones.service.js";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { HttpError } from "../../middleware/errors.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { obtenerSesion } from "../auth/auth.service.js";

export const reservasRouter = Router();
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));
const instante = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).refine((v) => fecha.safeParse(v.slice(0, 10)).success);
const horaDb = (h) => new Date(`1970-01-01T${h}:00.000Z`);
const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const horaTexto = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const local = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 16);
const utc = (v) => new Date(`${v}:00-05:00`);
function validar(schema, valor) {
  const r = schema.safeParse(valor);
  if (!r.success) throw new HttpError(400, "Revisa los datos enviados.");
  return r.data;
}
async function horario(id, db = prisma) {
  const tutor = await db.tutor.findUnique({ where: { userId: id }, include: { weeklyAvailability: true, exceptions: true, schedulingRules: { include: { durations: true } } } });
  if (!tutor) throw new HttpError(404, "Tutor no encontrado.");
  return {
    tutorId: id,
    bloques: tutor.weeklyAvailability.map((b) => ({ id: b.id, dia: b.dayOfWeek, inicio: b.startTime.toISOString().slice(11, 16), fin: b.endTime.toISOString().slice(11, 16) })),
    excepciones: tutor.exceptions.map((e) => ({ fecha: e.date.toISOString().slice(0, 10), motivo: e.reason ?? undefined })),
    reglas: { duraciones: tutor.schedulingRules?.durations.map((d) => d.durationMinutes).sort((a, b) => a - b) ?? [], descansoMinutos: tutor.schedulingRules?.breakMinutes ?? 15, antelacionHoras: tutor.schedulingRules?.minimumNoticeHours ?? 12 },
  };
}
async function lockTutor(db, id) { await db.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${id} FOR UPDATE`; }
function turnosAgenda(agenda, desde, dias, duracion, ocupadas, ahora = new Date()) {
  const limite = ahora.getTime() + agenda.reglas.antelacionHoras * 3600000;
  const excluidas = new Set(agenda.excepciones.map((e) => e.fecha));
  return Array.from({ length: dias }, (_, i) => {
    const d = new Date(`${desde}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    const f = d.toISOString().slice(0, 10), disponibles = [];
    if (!excluidas.has(f) && agenda.reglas.duraciones.includes(duracion)) {
      for (const bloque of agenda.bloques.filter((b) => b.dia === d.getUTCDay())) {
        for (let m = aMin(bloque.inicio); m + duracion <= aMin(bloque.fin); m += duracion + agenda.reglas.descansoMinutos) {
          const inicio = `${f}T${horaTexto(m)}`, fin = `${f}T${horaTexto(m + duracion)}`;
          const ini = utc(inicio), end = utc(fin), descanso = agenda.reglas.descansoMinutos * 60000;
          if (ini.getTime() < limite || ocupadas.some((r) => ini.getTime() < r.endsAt.getTime() + descanso && r.startsAt.getTime() < end.getTime() + descanso)) continue;
          disponibles.push({ inicio, fin, horaInicio: inicio.slice(11), horaFin: fin.slice(11) });
        }
      }
    }
    return { fecha: f, turnos: disponibles.sort((a, b) => a.inicio.localeCompare(b.inicio)) };
  });
}
const activos = ["pending", "accepted", "in_progress"];
async function ocupadas(id, db = prisma, excluirId) { return db.booking.findMany({ where: { tutorId: id, status: { in: activos }, ...(excluirId ? { id: { not: excluirId } } : {}) }, select: { startsAt: true, endsAt: true } }); }
reservasRouter.get("/tutores/:id/disponibilidad", async (req, res) => {
  const agenda = await horario(req.params.id);
  const token = req.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const sesion = token ? await obtenerSesion(token) : null;
  if (sesion?.userId !== req.params.id || sesion.user.role !== "tutor") agenda.excepciones = agenda.excepciones.map(({ fecha }) => ({ fecha }));
  res.set("Cache-Control", "no-store").json(agenda);
});
reservasRouter.get("/tutores/:id/turnos", async (req, res) => {
  const q = validar(z.object({ desde: fecha, dias: z.coerce.number().int().min(1).max(60), duracion_minutos: z.coerce.number().int().min(15).max(480) }), req.query);
  const agenda = await horario(req.params.id);
  res.set("Cache-Control", "no-store").json(turnosAgenda(agenda, q.desde, q.dias, q.duracion_minutos, await ocupadas(req.params.id)));
});
const bloque = z.object({ id: z.string().min(1).max(100), dia: z.number().int().min(0).max(6), inicio: hora, fin: hora }).strict();
const reglas = z.object({ duraciones: z.array(z.number().int().min(15).max(480)).min(1).max(20).refine((v) => new Set(v).size === v.length), descansoMinutos: z.number().int().min(0).max(180), antelacionHoras: z.number().int().min(0).max(720) }).strict();
reservasRouter.put("/tutores/:id/disponibilidad/:parte", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor" || req.authSession.userId !== req.params.id) throw new HttpError(403, "No puedes editar esta disponibilidad.");
  const parte = req.params.parte;
  if (!["bloques", "reglas", "excepciones"].includes(parte)) throw new HttpError(404, "Ruta no encontrada.");
  let datos;
  if (parte === "bloques") {
    datos = validar(z.object({ bloques: z.array(bloque).max(100) }).strict(), req.body).bloques;
    if (new Set(datos.map((b) => b.id)).size !== datos.length || datos.some((b) => b.inicio >= b.fin || datos.some((otro) => otro !== b && otro.dia === b.dia && b.inicio < otro.fin && otro.inicio < b.fin))) throw new HttpError(400, "Las franjas deben ser válidas y no superponerse.");
  } else if (parte === "reglas") datos = validar(reglas, req.body);
  else {
    datos = validar(z.object({ excepciones: z.array(z.object({ fecha, motivo: z.string().max(200).optional() }).strict()).max(366) }).strict(), req.body).excepciones;
    if (new Set(datos.map((e) => e.fecha)).size !== datos.length) throw new HttpError(400, "Los días bloqueados no pueden repetirse.");
  }
  await prisma.$transaction(async (tx) => {
    await lockTutor(tx, req.params.id);
    if (parte === "bloques") {
      await tx.weeklyAvailability.deleteMany({ where: { tutorId: req.params.id } });
      if (datos.length) await tx.weeklyAvailability.createMany({ data: datos.map((b) => ({ id: `h-${randomUUID()}`, tutorId: req.params.id, dayOfWeek: b.dia, startTime: horaDb(b.inicio), endTime: horaDb(b.fin) })) });
    } else if (parte === "excepciones") {
      await tx.availabilityException.deleteMany({ where: { tutorId: req.params.id } });
      if (datos.length) await tx.availabilityException.createMany({ data: datos.map((e) => ({ tutorId: req.params.id, date: new Date(`${e.fecha}T00:00:00Z`), reason: e.motivo })) });
    } else {
      await tx.schedulingRules.upsert({ where: { tutorId: req.params.id }, create: { tutorId: req.params.id, breakMinutes: datos.descansoMinutos, minimumNoticeHours: datos.antelacionHoras }, update: { breakMinutes: datos.descansoMinutos, minimumNoticeHours: datos.antelacionHoras } });
      await tx.allowedSessionDuration.deleteMany({ where: { tutorId: req.params.id } });
      await tx.allowedSessionDuration.createMany({ data: datos.duraciones.map((durationMinutes) => ({ tutorId: req.params.id, durationMinutes })) });
    }
  });
  res.json(await horario(req.params.id));
});
const nueva = z.object({ tutorId: z.string().min(1).max(100), materiaId: z.string().min(1).max(100), nivelId: z.string().min(1).max(100), modalidad: z.enum(["virtual", "presencial"]), inicio: instante, duracionMinutos: z.number().int().min(15).max(480), lugar: z.string().trim().max(500).optional(), notaEstudiante: z.string().trim().max(2000).optional() }).strict();
reservasRouter.post("/reservas", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "student") throw new HttpError(403, "Inicia sesión como estudiante para reservar.");
  const d = validar(nueva, req.body);
  if (utc(d.inicio).getTime() > Date.now() + 61 * 86400000) throw new HttpError(400, "Elige un turno dentro de los próximos 60 días.");
  if (d.modalidad === "presencial" && !d.lugar) throw new HttpError(400, "Indica el punto de encuentro.");
  const resultado = await prisma.$transaction(async (tx) => {
    await lockTutor(tx, d.tutorId);
    const tutor = await tx.tutor.findUnique({ where: { userId: d.tutorId }, include: { subjects: { where: { subjectId: d.materiaId }, include: { levels: true } } } });
    const materia = tutor?.subjects[0];
    if (!materia || !materia.levels.some((n) => n.educationLevelId === d.nivelId)) throw new HttpError(400, "El tutor no ofrece esta materia y nivel.");
    if ((d.modalidad === "virtual" && tutor.modality === "in_person") || (d.modalidad === "presencial" && tutor.modality === "online")) throw new HttpError(400, "El tutor no ofrece esta modalidad.");
    const agenda = await horario(d.tutorId, tx);
    const turno = turnosAgenda(agenda, d.inicio.slice(0, 10), 1, d.duracionMinutos, await ocupadas(d.tutorId, tx))[0].turnos.find((t) => t.inicio === d.inicio);
    if (!turno) throw new HttpError(409, "Ese turno ya no está disponible. Elige otro horario.");
    const reserva = await tx.booking.create({ data: { id: `r-${randomUUID()}`, tutorId: d.tutorId, studentId: req.authSession.userId, subjectId: d.materiaId, educationLevelId: d.nivelId, modality: d.modalidad === "virtual" ? "online" : "in_person", startsAt: utc(turno.inicio), endsAt: utc(turno.fin), durationMinutes: d.duracionMinutos, price: Math.round(Number(materia.hourlyRate) * d.duracionMinutos / 60), meetingLocation: d.modalidad === "presencial" ? d.lugar : null, studentNote: d.notaEstudiante } });
    await crearNotificacion(tx, { destinatarioId: d.tutorId, tipo: "new_booking", titulo: "Nueva solicitud de tutoría", detalle: `Tienes una solicitud para el ${turno.inicio.replace("T", " a las ")}.`, enlace: "/tutor/solicitudes" });
    return { id: reserva.id, inicio: turno.inicio, fin: turno.fin, precio: Number(reserva.price), lugar: reserva.meetingLocation ?? undefined };
  });
  res.status(201).set("Cache-Control", "no-store").json(resultado);
});
reservasRouter.get("/reservas/mias", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "student") throw new HttpError(403, "Solo los estudiantes pueden consultar sus reservas.");
  const rows = await prisma.booking.findMany({ where: { studentId: req.authSession.userId }, include: { tutor: { include: { user: { select: { name: true } } } }, subject: true, educationLevel: true, report: true, review: { select: { id: true } } }, orderBy: { startsAt: "desc" } });
  const ahora = new Date();
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({ id: r.id, tutorId: r.tutorId, tutorNombre: r.tutor.user.name, materiaNombre: r.subject.name, nivelNombre: r.educationLevel.name, inicio: local(r.startsAt), fin: local(r.endsAt), duracionMinutos: r.durationMinutes, modalidad: r.modality === "online" ? "virtual" : "presencial", precio: Number(r.price), estado: { pending: "pendiente", accepted: "aceptada", rejected: "rechazada", in_progress: "en-curso", completed: "finalizada", cancelled: "cancelada" }[r.status], motivoRechazo: r.rejectionReason, puedeModificar: ["pending", "accepted"].includes(r.status) && r.startsAt > ahora, puedeResenar: r.status === "completed" && r.report?.studentAttended === true && !r.review })));
});
async function reservaPropia(req, db = prisma) {
  if (req.authSession.user.role !== "student") throw new HttpError(403, "Solo el estudiante puede modificar su reserva.");
  const reserva = await db.booking.findFirst({ where: { id: req.params.id, studentId: req.authSession.userId } });
  if (!reserva) throw new HttpError(404, "No encontramos esa reserva.");
  return reserva;
}
function comprobarActiva(reserva) {
  if (!["pending", "accepted"].includes(reserva.status) || reserva.startsAt <= new Date()) throw new HttpError(409, "Solo puedes modificar una reserva futura pendiente o aceptada.");
}
reservasRouter.post("/reservas/:id/cancelar", requerirSesion, async (req, res) => {
  const original = await reservaPropia(req);
  await prisma.$transaction(async (tx) => {
  const cambiada = await tx.booking.updateMany({ where: { id: req.params.id, studentId: req.authSession.userId, status: { in: ["pending", "accepted"] }, startsAt: { gt: new Date() } }, data: { status: "cancelled" } });
  if (!cambiada.count) throw new HttpError(409, "La reserva cambió o ya no se puede cancelar.");
  await crearNotificacion(tx, { destinatarioId: original.tutorId, tipo: "booking_cancelled", titulo: "Se canceló una sesión", detalle: "El estudiante canceló una reserva.", enlace: "/tutor/agenda" });
  });
  res.sendStatus(204);
});
reservasRouter.get("/reservas/:id/turnos", requerirSesion, async (req, res) => {
  const r = await reservaPropia(req);
  comprobarActiva(r);
  const q = validar(z.object({ desde: fecha, dias: z.coerce.number().int().min(1).max(60) }).strict(), req.query);
  const agenda = await horario(r.tutorId);
  res.set("Cache-Control", "no-store").json(turnosAgenda(agenda, q.desde, q.dias, r.durationMinutes, await ocupadas(r.tutorId, prisma, r.id)));
});
reservasRouter.patch("/reservas/:id/reprogramar", requerirSesion, async (req, res) => {
  const d = validar(z.object({ inicio: instante, inicioAnterior: instante }).strict(), req.body);
  if (utc(d.inicio).getTime() > Date.now() + 61 * 86400000) throw new HttpError(400, "Elige un turno dentro de los próximos 60 días.");
  const original = await reservaPropia(req);
  await prisma.$transaction(async (tx) => {
    await lockTutor(tx, original.tutorId);
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${req.params.id} FOR UPDATE`;
    const r = await reservaPropia(req, tx);
    comprobarActiva(r);
    if (local(r.startsAt) !== d.inicioAnterior) throw new HttpError(409, "La reserva cambió. Recarga la página.");
    if (d.inicio === d.inicioAnterior) throw new HttpError(400, "Elige un horario diferente.");
    const agenda = await horario(r.tutorId, tx);
    const turno = turnosAgenda(agenda, d.inicio.slice(0, 10), 1, r.durationMinutes, await ocupadas(r.tutorId, tx, r.id))[0].turnos.find((t) => t.inicio === d.inicio);
    if (!turno) throw new HttpError(409, "Ese turno ya no está disponible. Elige otro horario.");
    await tx.booking.update({ where: { id: r.id }, data: { startsAt: utc(turno.inicio), endsAt: utc(turno.fin), status: "pending", rejectionReason: null } });
    await crearNotificacion(tx, { destinatarioId: r.tutorId, tipo: "booking_rescheduled", titulo: "Se reprogramó una sesión", detalle: `La nueva fecha es ${turno.inicio.replace("T", " a las ")}.`, enlace: "/tutor/solicitudes" });
  });
  res.sendStatus(204);
});
