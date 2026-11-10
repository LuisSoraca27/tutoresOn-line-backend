import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { HttpError } from "../../middleware/errors.js";
import { hashClave, verificarClave, hashToken } from "./passwords.js";

const incluir = { student: true, tutor: { select: { avatarUrl: true } } };
const DURACION_SESION_MS = 7 * 24 * 60 * 60 * 1000;

export function vistaUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.name,
    correo: usuario.email,
    rol: usuario.role === "student" ? "estudiante" : "tutor",
    telefono: usuario.phone ?? undefined,
    ciudadId: usuario.cityId ?? undefined,
    nivelId: usuario.student?.educationLevelId,
    avatarUrl: usuario.tutor?.avatarUrl?.startsWith("r2:avatars/")
      ? `/api/v1/tutores/${encodeURIComponent(usuario.id)}/foto?v=${encodeURIComponent(usuario.tutor.avatarUrl.slice(11))}`
      : usuario.tutor?.avatarUrl ?? null,
    creadoEn: usuario.createdAt.toISOString(),
  };
}

async function crearSesion(usuario, db = prisma) {
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: { tokenHash: hashToken(token), userId: usuario.id, expiresAt: new Date(Date.now() + DURACION_SESION_MS) },
  });
  return { usuario: vistaUsuario(usuario), token };
}

export async function iniciarSesion({ correo, clave }) {
  const usuario = await prisma.user.findUnique({ where: { email: correo }, include: incluir });
  if (!(await verificarClave(clave, usuario?.passwordHash)) || !usuario) {
    throw new HttpError(401, "Correo o contraseña incorrectos.");
  }
  return crearSesion(usuario);
}

export async function registrar(rol, datos) {
  const esTutor = rol === "tutor";
  if (esTutor && (new Set(datos.materias.map((m) => m.materiaId)).size !== datos.materias.length ||
      datos.materias.some((m) => new Set(m.nivelIds).size !== m.nivelIds.length))) {
    throw new HttpError(400, "Las materias y niveles no pueden repetirse.");
  }
  const passwordHash = await hashClave(datos.clave);
  try {
    return await prisma.$transaction(async (tx) => {
      const id = `${esTutor ? "t" : "e"}-${randomUUID()}`;
      const userData = {
        id, name: datos.nombre, email: datos.correo, passwordHash,
        role: esTutor ? "tutor" : "student", phone: datos.telefono, cityId: datos.ciudadId,
      };
      if (esTutor) {
        const idiomas = [...new Set(datos.idiomas.map((idioma) => idioma.trim().toLowerCase()))];
        for (const idioma of idiomas) {
          await tx.language.upsert({ where: { id: idioma }, create: { id: idioma, name: idioma }, update: {} });
        }
        userData.tutor = { create: {
          professionalTitle: datos.titulo,
          bio: datos.bio,
          modality: { virtual: "online", presencial: "in_person", ambas: "both" }[datos.modalidad],
          coverageRadiusKm: datos.radioKm,
          subjects: { create: datos.materias.map((materia) => ({
            subjectId: materia.materiaId,
            hourlyRate: materia.precioHora,
            levels: { create: materia.nivelIds.map((nivelId) => ({ educationLevelId: nivelId })) },
          })) },
          languages: { create: idiomas.map((languageId) => ({ languageId })) },
          schedulingRules: { create: { durations: { create: [60, 90, 120].map((durationMinutes) => ({ durationMinutes })) } } },
        } };
      } else {
        userData.student = { create: { educationLevelId: datos.nivelId } };
      }
      const usuario = await tx.user.create({ data: userData, include: incluir });
      return crearSesion(usuario, tx);
    });
  } catch (error) {
    if (error.code === "P2002") throw new HttpError(409, "Ya hay una cuenta con ese correo o datos repetidos.");
    if (error.code === "P2003" || error.code === "P2025") throw new HttpError(400, "Selecciona una ciudad, materia y nivel válidos.");
    throw error;
  }
}

export async function correoDisponible(correo) {
  return !(await prisma.user.findUnique({ where: { email: correo }, select: { id: true } }));
}
export async function obtenerSesion(token) {
  const registro = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) }, include: { user: { include: incluir } },
  });
  return registro && registro.expiresAt > new Date() ? registro : null;
}
export async function cerrarSesion(tokenHash) {
  await prisma.authSession.deleteMany({ where: { tokenHash } });
}
export async function actualizarPerfil(userId, datos) {
  try {
    const usuario = await prisma.user.update({
      where: { id: userId },
      data: { name: datos.nombre, email: datos.correo, phone: datos.telefono ?? null },
      include: incluir,
    });
    return vistaUsuario(usuario);
  } catch (error) {
    if (error.code === "P2002") throw new HttpError(409, "Ese correo ya está en uso.");
    throw error;
  }
}
