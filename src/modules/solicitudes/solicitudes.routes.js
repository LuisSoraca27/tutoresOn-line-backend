import { crearNotificacion } from "../notificaciones/notificaciones.service.js";
import { Router } from "express";
import { z } from "zod";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";
import { prisma } from "../../database/prisma.js";

export const solicitudesRouter = Router();
solicitudesRouter.use(requerirSesion, (req, _res, next) => {
  if (req.authSession.user.role !== "tutor") throw new HttpError(403, "Solo los tutores pueden consultar sus solicitudes.");
  next();
});

const horaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function local(date) {
  const p = Object.fromEntries(horaBogota.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

solicitudesRouter.get("/", async (req, res) => {
  const rows = await prisma.booking.findMany({
    where: { tutorId: req.authSession.userId, status: { in: ["pending", "accepted", "rejected"] } },
    include: { student: { include: { user: { select: { name: true } } } }, subject: true, educationLevel: true },
    orderBy: { startsAt: "asc" },
  });
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({
    id: r.id, estudianteNombre: r.student.user.name, materiaNombre: r.subject.name, nivelNombre: r.educationLevel.name,
    inicio: local(r.startsAt), fin: local(r.endsAt), duracionMinutos: r.durationMinutes, precio: Number(r.price),
    modalidad: r.modality === "online" ? "virtual" : "presencial",
    estado: { pending: "pendiente", accepted: "aceptada", rejected: "rechazada" }[r.status],
    lugar: r.meetingLocation, notaEstudiante: r.studentNote, motivoRechazo: r.rejectionReason,
  })));
});

const inicioEsperado = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).refine((s) => !Number.isNaN(new Date(`${s}:00-05:00`).getTime()) && local(new Date(`${s}:00-05:00`)) === s);
const respuesta = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("aceptada"), inicioEsperado }).strict(),
  z.object({ estado: z.literal("rechazada"), motivo: z.string().trim().min(1).max(2000), inicioEsperado }).strict(),
]);
solicitudesRouter.patch("/:id", async (req, res) => {
  const parsed = respuesta.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Indica una respuesta válida y un motivo para rechazar.");
  const datos = parsed.data;
  await prisma.$transaction(async (tx) => {
  const changed = await tx.booking.updateMany({
    where: { id: req.params.id, tutorId: req.authSession.userId, status: "pending", startsAt: new Date(`${datos.inicioEsperado}:00-05:00`) },
    data: { status: datos.estado === "aceptada" ? "accepted" : "rejected", rejectionReason: datos.estado === "rechazada" ? datos.motivo : null },
  });
  if (!changed.count) {
    const own = await tx.booking.findFirst({ where: { id: req.params.id, tutorId: req.authSession.userId }, select: { id: true } });
    if (!own) throw new HttpError(404, "No encontramos esa solicitud.");
    throw new HttpError(409, "La solicitud cambió o ya fue respondida. Actualiza la página.");
  }
  const reserva = await tx.booking.findUnique({ where: { id: req.params.id }, select: { studentId: true } });
  await crearNotificacion(tx, { destinatarioId: reserva.studentId, tipo: datos.estado === "aceptada" ? "booking_accepted" : "booking_rejected", titulo: datos.estado === "aceptada" ? "Tu sesión fue aceptada" : "El tutor no pudo tomar tu sesión", detalle: datos.estado === "aceptada" ? `Tu sesión está confirmada para ${datos.inicioEsperado.replace("T", " a las ")}.` : datos.motivo, enlace: "/estudiante/reservas" });
  });
  res.sendStatus(204);
});
