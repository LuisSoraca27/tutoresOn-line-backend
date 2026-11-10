import { prisma } from "../src/database/prisma.js";
import { hashClave } from "../src/modules/auth/passwords.js";

// Datos de demostración explícitos: nunca reemplaza cuentas ni contraseñas existentes.
try {
  const hash = await hashClave("demo1234");
  const cuentas = [
    { id: "e-001", name: "Sara Betancur", email: "sara@ejemplo.co", role: "student", cityId: "bogota", phone: "+57 300 111 2233", student: { create: { educationLevelId: "universitario" } } },
    { id: "t-001", name: "Mariana Restrepo", email: "mariana@ejemplo.co", role: "tutor", cityId: "medellin", phone: "+57 301 444 5566", tutor: { create: {
      professionalTitle: "Matemática, MSc. en Estadística", bio: "Acompaño a estudiantes universitarios en cálculo y estadística.", modality: "both", coverageRadiusKm: 12, verified: true,
      subjects: { create: ["calculo", "estadistica"].map((subjectId) => ({ subjectId, hourlyRate: 52000, levels: { create: [{ educationLevelId: "universitario" }, { educationLevelId: "bachillerato" }] } })) },
      schedulingRules: { create: { durations: { create: [60, 90, 120].map((durationMinutes) => ({ durationMinutes })) } } },
      weeklyAvailability: { create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ id: `demo-mariana-${dayOfWeek}`, dayOfWeek, startTime: new Date("1970-01-01T08:00:00Z"), endTime: new Date("1970-01-01T18:00:00Z") })) },
    } } },
  ];
  for (const cuenta of cuentas) {
    const existente = await prisma.user.findFirst({ where: { OR: [{ id: cuenta.id }, { email: cuenta.email }] } });
    if (existente) { console.log(`Cuenta ${cuenta.email}: ya existe, se conserva.`); continue; }
    await prisma.user.create({ data: { ...cuenta, passwordHash: hash } });
    console.log(`Cuenta ${cuenta.email}: creada.`);
  }
} finally { await prisma.$disconnect(); }
