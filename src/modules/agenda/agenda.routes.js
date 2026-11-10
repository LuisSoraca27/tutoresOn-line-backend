import { Router } from "express";
import { z } from "zod";
import { requerirSesion } from "../auth/auth.middleware.js";
import { prisma } from "../../database/prisma.js";
import { HttpError } from "../../middleware/errors.js";

export const agendaRouter = Router();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
});
const periodo = z.object({ desde: fecha, hasta: fecha }).strict();
const enBogota = (d) => new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);

agendaRouter.get("/", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor") throw new HttpError(403, "Solo los tutores pueden consultar su agenda.");
  const parsed = periodo.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Indica un período válido para la agenda.");
  const { desde, hasta } = parsed.data;
  const inicio = new Date(`${desde}T00:00:00-05:00`);
  const fin = new Date(new Date(`${hasta}T00:00:00-05:00`).getTime() + 86400000);
  if (fin <= inicio || fin.getTime() - inicio.getTime() > 31 * 86400000) throw new HttpError(400, "El período debe tener entre 1 y 31 días.");
  const rows = await prisma.booking.findMany({
    where: { tutorId: req.authSession.userId, status: { in: ["pending", "accepted", "in_progress"] }, startsAt: { gte: inicio, lt: fin } },
    select: { id: true, startsAt: true, endsAt: true, durationMinutes: true, price: true, status: true, modality: true, meetingLocation: true,
      student: { select: { user: { select: { name: true } } } }, subject: { select: { name: true } }, educationLevel: { select: { name: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  res.set("Cache-Control", "no-store").json(rows.map((r) => ({
    id: r.id, inicio: enBogota(r.startsAt), fin: enBogota(r.endsAt), duracionMinutos: r.durationMinutes, precio: Number(r.price),
    estudianteNombre: r.student.user.name, materiaNombre: r.subject.name, nivelNombre: r.educationLevel.name,
    modalidad: r.modality === "online" ? "virtual" : "presencial", lugar: r.meetingLocation,
    estado: { pending: "pendiente", accepted: "aceptada", in_progress: "en-curso" }[r.status],
  })));
});
