import { prisma } from "../../database/prisma.js";

export async function materias() {
  const rows = await prisma.subject.findMany({ orderBy: { name: "asc" } });
  return rows.map(({ id, name, area }) => ({ id, nombre: name, area }));
}
export async function niveles() {
  const rows = await prisma.educationLevel.findMany();
  return rows.map(({ id, name }) => ({ id, nombre: name }));
}
export async function ciudades() {
  const rows = await prisma.city.findMany({ orderBy: { name: "asc" } });
  return rows.map(({ id, name, department }) => ({ id, nombre: name, departamento: department }));
}
