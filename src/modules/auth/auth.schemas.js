import { z } from "zod";

const correo = z.string().trim().toLowerCase().email().max(254);
const clave = z.string().min(8).max(128).regex(/[a-zA-Z]/).regex(/[0-9]/);
const opcional = z.string().trim().max(200).optional().transform((v) => v || undefined);
const base = z.object({
  nombre: z.string().trim().min(3).max(120), correo, clave,
  telefono: opcional, ciudadId: opcional,
});
export const loginSchema = z.object({ correo, clave: z.string().min(1).max(128) });
export const correoSchema = correo;
export const estudianteSchema = base.extend({ nivelId: z.string().min(1).max(100) });
export const tutorSchema = base.extend({
  titulo: z.string().trim().min(5).max(200),
  bio: z.string().trim().min(40).max(5000),
  modalidad: z.enum(["virtual", "presencial", "ambas"]),
  radioKm: z.number().positive().max(9999).optional(),
  materias: z.array(z.object({
    materiaId: z.string().min(1).max(100),
    nivelIds: z.array(z.string().min(1).max(100)).min(1).max(20),
    precioHora: z.number().int().min(10000).max(9999999999),
  })).min(1).max(50),
  idiomas: z.array(z.string().trim().min(1).max(100)).max(30),
}).refine((datos) => datos.modalidad === "virtual" || !!datos.ciudadId);
export const perfilSchema = z.object({
  nombre: z.string().trim().min(3).max(120), correo, telefono: opcional,
}).strict();
