import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { HttpError } from "../../middleware/errors.js";

export const favoritosRouter = Router();
favoritosRouter.use(requerirSesion, (req, _res, next) => {
  if (req.authSession.user.role !== "student") throw new HttpError(403, "Solo los estudiantes pueden gestionar favoritos.");
  next();
});
favoritosRouter.get("/", async (req, res) => {
  const rows = await prisma.favorite.findMany({ where: { studentId: req.authSession.userId }, select: { tutorId: true }, orderBy: { tutorId: "asc" } });
  res.set("Cache-Control", "no-store").json(rows.map((row) => row.tutorId));
});
favoritosRouter.put("/:tutorId", async (req, res) => {
  const tutor = await prisma.tutor.findFirst({ where: { userId: req.params.tutorId, subjects: { some: {} } }, select: { userId: true } });
  if (!tutor) throw new HttpError(404, "No encontramos ese tutor.");
  await prisma.favorite.upsert({ where: { studentId_tutorId: { studentId: req.authSession.userId, tutorId: tutor.userId } }, create: { studentId: req.authSession.userId, tutorId: tutor.userId }, update: {} });
  res.sendStatus(204);
});
favoritosRouter.delete("/:tutorId", async (req, res) => {
  await prisma.favorite.deleteMany({ where: { studentId: req.authSession.userId, tutorId: req.params.tutorId } });
  res.sendStatus(204);
});
