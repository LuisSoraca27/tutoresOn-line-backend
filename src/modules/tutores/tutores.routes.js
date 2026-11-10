import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errors.js";
import * as tutores from "./tutores.service.js";
import { requerirSesion } from "../auth/auth.middleware.js";
import { prisma } from "../../database/prisma.js";
import { randomUUID } from "node:crypto";
import { subirFoto, leerFoto, borrarFoto } from "../../storage/r2.js";

const filtros = z.object({
  q: z.string().trim().max(200).optional(), area: z.string().trim().min(1).max(100).optional(), materia_id: z.string().max(100).optional(), nivel_id: z.string().max(100).optional(),
  ciudad_id: z.string().max(100).optional(), modalidad: z.enum(["virtual", "presencial", "ambas"]).optional(),
  precio_max: z.coerce.number().min(0).optional(), calificacion_min: z.coerce.number().min(0).max(5).optional(),
  solo_verificados: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  orden: z.enum(["relevancia", "precio-asc", "precio-desc", "calificacion", "sesiones"]).optional(),
  pagina: z.coerce.number().int().min(1).max(100000).optional(), por_pagina: z.coerce.number().int().min(1).max(100).optional(),
});
export const tutoresRouter = Router();
const presentacion = z.object({ titulo: z.string().trim().min(5).max(200), bio: z.string().trim().min(40).max(5000), idiomas: z.array(z.string().trim().min(1).max(100)).min(1).max(30) }).strict();
tutoresRouter.put("/:id/presentacion", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor" || req.authSession.userId !== req.params.id) throw new HttpError(403, "No puedes editar este perfil.");
  const parsed = presentacion.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Revisa tu título, presentación e idiomas.");
  const { titulo, bio } = parsed.data;
  const idiomas = parsed.data.idiomas.map((idioma) => idioma.toLowerCase());
  if (new Set(idiomas).size !== idiomas.length) throw new HttpError(400, "Los idiomas no pueden repetirse.");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${req.params.id} FOR UPDATE`;
    await tx.tutor.update({ where: { userId: req.params.id }, data: { professionalTitle: titulo, bio } });
    await tx.tutorLanguage.deleteMany({ where: { tutorId: req.params.id } });
    for (const idioma of idiomas) {
      await tx.language.upsert({ where: { id: idioma }, create: { id: idioma, name: idioma }, update: {} });
      await tx.tutorLanguage.create({ data: { tutorId: req.params.id, languageId: idioma } });
    }
  });
  res.set("Cache-Control", "no-store").json(await tutores.obtener(req.params.id));
});
const foto = z.object({ avatarUrl: z.string().max(682700).nullable() }).strict();
tutoresRouter.put("/:id/foto", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor" || req.authSession.userId !== req.params.id) throw new HttpError(403, "No puedes editar este perfil.");
  const parsed = foto.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "La foto no es válida o supera 500 KB.");
  const avatarUrl = parsed.data.avatarUrl;
  let nuevaClave = null;
  if (avatarUrl !== null) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(avatarUrl);
    if (!match) throw new HttpError(400, "La foto debe ser PNG, JPG o WebP.");
    const bytes = Buffer.from(match[2], "base64");
    const valido = bytes.length > 0 && bytes.length <= 512000 && bytes.toString("base64") === match[2] && (
      (match[1] === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (match[1] === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (match[1] === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    );
    if (!valido) throw new HttpError(400, "La foto debe ser PNG, JPG o WebP y pesar hasta 500 KB.");
    nuevaClave = `avatars/${randomUUID()}`;
    await subirFoto(nuevaClave, bytes, match[1]);
  }
  let anterior;
  try {
    anterior = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${req.params.id} FOR UPDATE`;
      const actual = await tx.tutor.findUniqueOrThrow({ where: { userId: req.params.id }, select: { avatarUrl: true } });
      await tx.tutor.update({ where: { userId: req.params.id }, data: { avatarUrl: nuevaClave ? `r2:${nuevaClave}` : null } });
      return actual.avatarUrl;
    });
  } catch (error) {
    if (nuevaClave) await borrarFoto(nuevaClave).catch((fallo) => console.error("No se pudo limpiar la foto subida a R2:", fallo));
    throw error;
  }
  if (anterior?.startsWith("r2:avatars/")) await borrarFoto(anterior.slice(3)).catch((error) => console.error("No se pudo eliminar la foto anterior de R2:", error));
  res.sendStatus(204);
});
tutoresRouter.get("/:id/foto", async (req, res) => {
  const tutor = await prisma.tutor.findUnique({ where: { userId: req.params.id }, select: { avatarUrl: true } });
  if (!tutor?.avatarUrl?.startsWith("r2:avatars/")) throw new HttpError(404, "Foto no encontrada.");
  const fotoR2 = await leerFoto(tutor.avatarUrl.slice(3));
  if (!["image/png", "image/jpeg", "image/webp"].includes(fotoR2.contentType)) throw new HttpError(404, "Foto no encontrada.");
  res.set("Cache-Control", "public, max-age=60").set("X-Content-Type-Options", "nosniff").type(fotoR2.contentType).send(fotoR2.bytes);
});
const materia = z.object({ materiaId: z.string().min(1).max(100), nivelIds: z.array(z.string().min(1).max(100)).min(1).max(20), precioHora: z.number().int().min(10000).max(9999999999) }).strict();
const oferta = z.object({ materias: z.array(materia).min(1).max(50) }).strict();
const cobertura = z.discriminatedUnion("modalidad", [
  z.object({ modalidad: z.literal("virtual"), ciudadId: z.null(), radioKm: z.null() }).strict(),
  z.object({ modalidad: z.literal("presencial"), ciudadId: z.string().min(1).max(100), radioKm: z.number().int().min(1).max(40) }).strict(),
  z.object({ modalidad: z.literal("ambas"), ciudadId: z.string().min(1).max(100), radioKm: z.number().int().min(1).max(40) }).strict(),
]);
tutoresRouter.put("/:id/cobertura", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor" || req.authSession.userId !== req.params.id) throw new HttpError(403, "No puedes editar este perfil.");
  const validado = cobertura.safeParse(req.body);
  if (!validado.success) throw new HttpError(400, "Revisa la modalidad, la ciudad y el radio de cobertura.");
  const datos = validado.data;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${req.params.id} FOR UPDATE`;
    if (datos.ciudadId && !(await tx.city.findUnique({ where: { id: datos.ciudadId }, select: { id: true } }))) throw new HttpError(400, "Selecciona una ciudad válida.");
    await tx.user.update({ where: { id: req.params.id }, data: { cityId: datos.ciudadId } });
    await tx.tutor.update({ where: { userId: req.params.id }, data: { modality: { virtual: "online", presencial: "in_person", ambas: "both" }[datos.modalidad], coverageRadiusKm: datos.radioKm } });
  });
  res.set("Cache-Control", "no-store").json(await tutores.obtener(req.params.id));
});
tutoresRouter.put("/:id/materias", requerirSesion, async (req, res) => {
  if (req.authSession.user.role !== "tutor" || req.authSession.userId !== req.params.id) throw new HttpError(403, "No puedes editar este perfil.");
  const validado = oferta.safeParse(req.body);
  if (!validado.success) throw new HttpError(400, "Revisa las materias, niveles y tarifas.");
  const { materias } = validado.data;
  if (new Set(materias.map((m) => m.materiaId)).size !== materias.length || materias.some((m) => new Set(m.nivelIds).size !== m.nivelIds.length)) throw new HttpError(400, "Las materias y niveles no pueden repetirse.");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT user_id FROM tutors WHERE user_id = ${req.params.id} FOR UPDATE`;
    const idsMaterias = materias.map((m) => m.materiaId);
    const idsNiveles = [...new Set(materias.flatMap((m) => m.nivelIds))];
    const cantidadMaterias = await tx.subject.count({ where: { id: { in: idsMaterias } } });
    const cantidadNiveles = await tx.educationLevel.count({ where: { id: { in: idsNiveles } } });
    if (cantidadMaterias !== idsMaterias.length || cantidadNiveles !== idsNiveles.length) throw new HttpError(400, "Selecciona materias y niveles válidos.");
    await tx.tutorSubjectLevel.deleteMany({ where: { tutorId: req.params.id } });
    await tx.tutorSubject.deleteMany({ where: { tutorId: req.params.id, subjectId: { notIn: idsMaterias } } });
    for (const m of materias) {
      await tx.tutorSubject.upsert({ where: { tutorId_subjectId: { tutorId: req.params.id, subjectId: m.materiaId } }, create: { tutorId: req.params.id, subjectId: m.materiaId, hourlyRate: m.precioHora }, update: { hourlyRate: m.precioHora } });
      await tx.tutorSubjectLevel.createMany({ data: m.nivelIds.map((nivel) => ({ tutorId: req.params.id, subjectId: m.materiaId, educationLevelId: nivel })) });
    }
  });
  res.set("Cache-Control", "no-store").json(await tutores.obtener(req.params.id));
});
tutoresRouter.get("/", async (req, res) => {
  const validado = filtros.safeParse(req.query);
  if (!validado.success) throw new HttpError(400, "Filtros de búsqueda inválidos.");
  res.json(await tutores.listar(validado.data));
});
tutoresRouter.get("/destacados", async (req, res) => {
  const limite = z.coerce.number().int().min(1).max(100).safeParse(req.query.limite ?? 6);
  if (!limite.success) throw new HttpError(400, "Límite inválido.");
  res.json((await tutores.listar({ por_pagina: limite.data })).items);
});
tutoresRouter.get("/:id", async (req, res) => res.json(await tutores.obtener(req.params.id)));
