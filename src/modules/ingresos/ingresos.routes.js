import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";

export const ingresosRouter = Router();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
});
const filtros = z.object({ desde: fecha.optional(), hasta: fecha.optional() }).strict();
const bogota = (d) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 16);

ingresosRouter.get("/", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor") throw new HttpError(403, "Solo los tutores pueden consultar sus sesiones.");
  const parsed = filtros.safeParse(req.query);
  if (!parsed.success || (parsed.data.desde && parsed.data.hasta && parsed.data.desde > parsed.data.hasta)) throw new HttpError(400, "Revisa las fechas del periodo.");
  const { desde, hasta } = parsed.data;
  const startsAt = {};
  if (desde) startsAt.gte = new Date(`${desde}T00:00:00-05:00`);
  if (hasta) startsAt.lt = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + 86400000);
  const rows = await prisma.booking.findMany({
    where: { tutorId: req.authSession.userId, status: "completed", report: { is: { studentAttended: true } }, startsAt },
    select: { id: true, startsAt: true, endsAt: true, price: true, report: { select: { actualDurationMinutes: true } }, student: { select: { user: { select: { name: true } } } }, subject: { select: { name: true } } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({
    id: r.id, fecha: bogota(r.startsAt).slice(0, 10), horaInicio: bogota(r.startsAt).slice(11), horaFin: bogota(r.endsAt).slice(11),
    tutorNombre: req.authSession.user.name, estudianteNombre: r.student.user.name, materiaNombre: r.subject.name,
    duracionMinutos: r.report.actualDurationMinutes, precio: Number(r.price),
  })));
});
