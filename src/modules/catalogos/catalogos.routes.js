import { Router } from "express";
import * as catalogos from "./catalogos.service.js";

export const catalogosRouter = Router();
catalogosRouter.get("/materias", async (_req, res) => res.json(await catalogos.materias()));
catalogosRouter.get("/niveles", async (_req, res) => res.json(await catalogos.niveles()));
catalogosRouter.get("/ciudades", async (_req, res) => res.json(await catalogos.ciudades()));
