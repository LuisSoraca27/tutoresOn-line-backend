import { prisma } from "../../database/prisma.js";
import { tutoresConectados } from "../express/realtime.js";

const include = {
  user: { select: { name: true, cityId: true } },
  subjects: { include: { levels: true, subject: { select: { name: true, area: true } } } },
  languages: { include: { language: true } },
  bookings: { where: { status: "completed" }, select: { review: { select: { rating: true } } } },
};

function vista(tutor) {
  const materias = tutor.subjects.map((m) => ({ materiaId: m.subjectId, nivelIds: m.levels.map((n) => n.educationLevelId), precioHora: Number(m.hourlyRate) }));
  const ratings = tutor.bookings.flatMap((b) => b.review ? [b.review.rating] : []);
  const distribucion = Object.fromEntries([5, 4, 3, 2, 1].map((n) => [String(n), ratings.filter((r) => r === n).length]));
  return {
    id: tutor.userId, nombre: tutor.user.name, titulo: tutor.professionalTitle, bio: tutor.bio,
    avatarUrl: tutor.avatarUrl?.startsWith("r2:avatars/") ? `/api/v1/tutores/${encodeURIComponent(tutor.userId)}/foto?v=${encodeURIComponent(tutor.avatarUrl.slice(11))}` : tutor.avatarUrl, modalidad: { online: "virtual", in_person: "presencial", both: "ambas" }[tutor.modality],
    ciudadId: tutor.user.cityId, radioKm: tutor.coverageRadiusKm == null ? null : Number(tutor.coverageRadiusKm),
    materias, precioDesde: materias.length ? Math.min(...materias.map((m) => m.precioHora)) : 0,
    reputacion: { promedio: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0, total: ratings.length, distribucion },
    sesionesCompletadas: tutor.bookings.length, verificado: tutor.verified, respondeRapido: tutor.respondsQuickly,
    disponibleAhora: tutoresConectados().includes(tutor.userId), idiomas: tutor.languages.map((l) => l.language.name),
  };
}

export async function listar(f = {}) {
  const rows = await prisma.tutor.findMany({ where: { subjects: { some: {} } }, include });
  const normalizar = (valor) => valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
  const q = f.q ? normalizar(f.q.trim()) : undefined;
  let items = rows.filter((row) => !q || [row.user.name, row.professionalTitle, row.bio, ...row.subjects.map((s) => s.subject.name)].some((value) => normalizar(value).includes(q))).map(vista);
  if (f.area) {
    const ids = new Set(rows.filter((row) => row.subjects.some((s) => s.subject.area === f.area && (!f.materia_id || s.subjectId === f.materia_id) && (!f.nivel_id || s.levels.some((n) => n.educationLevelId === f.nivel_id)) && (f.precio_max === undefined || Number(s.hourlyRate) <= f.precio_max))).map((row) => row.userId));
    items = items.filter((item) => ids.has(item.id));
  }
  items = items.filter((t) => t.materias.some((m) =>
    (!f.materia_id || m.materiaId === f.materia_id) && (!f.nivel_id || m.nivelIds.includes(f.nivel_id)) && (f.precio_max === undefined || m.precioHora <= f.precio_max)) &&
    (!f.modalidad || f.modalidad === "ambas" || t.modalidad === f.modalidad || t.modalidad === "ambas") &&
    (!f.ciudad_id || t.ciudadId === f.ciudad_id || t.modalidad === "virtual") &&
    (f.calificacion_min === undefined || t.reputacion.promedio >= f.calificacion_min) &&
    (!f.solo_verificados || t.verificado));
  const relevancia = (a, b) => Number(b.verificado) - Number(a.verificado) || b.reputacion.promedio - a.reputacion.promedio || b.sesionesCompletadas - a.sesionesCompletadas || a.id.localeCompare(b.id);
  const comparadores = { "precio-asc": (a, b) => a.precioDesde - b.precioDesde, "precio-desc": (a, b) => b.precioDesde - a.precioDesde, calificacion: (a, b) => b.reputacion.promedio - a.reputacion.promedio, sesiones: (a, b) => b.sesionesCompletadas - a.sesionesCompletadas };
  items.sort((a, b) => (comparadores[f.orden]?.(a, b) ?? 0) || relevancia(a, b));
  const pagina = f.pagina ?? 1, porPagina = f.por_pagina ?? 9;
  return { items: items.slice((pagina - 1) * porPagina, pagina * porPagina), total: items.length, pagina, porPagina };
}

export async function obtener(id) {
  const row = await prisma.tutor.findUnique({ where: { userId: id }, include });
  return row && row.subjects.length ? vista(row) : null;
}
