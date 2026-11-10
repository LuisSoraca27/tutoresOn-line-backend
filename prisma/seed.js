import { prisma } from "../src/database/prisma.js";

const niveles = [
  ["primaria", "Primaria"], ["bachillerato", "Bachillerato"],
  ["tecnico", "Técnico y tecnólogo"], ["universitario", "Universitario"], ["posgrado", "Posgrado"],
];
const materias = [
  ["calculo", "Cálculo", "Matemáticas"], ["algebra", "Álgebra", "Matemáticas"],
  ["estadistica", "Estadística", "Matemáticas"], ["fisica", "Física", "Ciencias"],
  ["quimica", "Química", "Ciencias"], ["biologia", "Biología", "Ciencias"],
  ["programacion", "Programación", "Tecnología"], ["bases-datos", "Bases de datos", "Tecnología"],
  ["ingles", "Inglés", "Idiomas"], ["frances", "Francés", "Idiomas"],
  ["lenguaje", "Lengua castellana", "Humanidades"], ["historia", "Historia", "Humanidades"],
  ["contabilidad", "Contabilidad", "Economía"],
];
const ciudades = [
  ["bogota", "Bogotá", "Cundinamarca"], ["medellin", "Medellín", "Antioquia"],
  ["cali", "Cali", "Valle del Cauca"], ["barranquilla", "Barranquilla", "Atlántico"],
  ["bucaramanga", "Bucaramanga", "Santander"], ["cartagena", "Cartagena", "Bolívar"],
];

try {
  await prisma.$transaction([
    ...niveles.map(([id, nombre]) => prisma.educationLevel.upsert({ where: { id }, create: { id, name: nombre }, update: { name: nombre } })),
    ...materias.map(([id, nombre, area]) => prisma.subject.upsert({ where: { id }, create: { id, name: nombre, area }, update: { name: nombre, area } })),
    ...ciudades.map(([id, nombre, departamento]) => prisma.city.upsert({ where: { id }, create: { id, name: nombre, department: departamento }, update: { name: nombre, department: departamento } })),
  ]);
  console.log("Catálogos inicializados.");
} finally {
  await prisma.$disconnect();
}
