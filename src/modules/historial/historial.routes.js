import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";

export const historialRouter = Router();
const enBogota = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 16);
const estados = { pending: "pendiente", accepted: "aceptada", rejected: "rechazada", in_progress: "en-curso", completed: "finalizada", cancelled: "cancelada" };

historialRouter.get("/", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor") throw new HttpError(403, "Solo los tutores pueden consultar su historial.");
  const rows = await prisma.booking.findMany({
    where: { tutorId: req.authSession.userId },
    select: { id: true, startsAt: true, endsAt: true, durationMinutes: true, price: true, status: true,
      student: { select: { user: { select: { name: true } } } }, subject: { select: { name: true } }, educationLevel: { select: { name: true } },
      report: { select: { studentAttended: true, actualDurationMinutes: true } } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({
    id: r.id, inicio: enBogota(r.startsAt), fin: enBogota(r.endsAt), duracionMinutos: r.durationMinutes,
    precio: Number(r.price), estado: estados[r.status], estudianteNombre: r.student.user.name,
    materiaNombre: r.subject.name, nivelNombre: r.educationLevel.name,
    cierre: r.report ? { asistio: r.report.studentAttended, duracionReal: r.report.actualDurationMinutes } : null,
  })));
});
