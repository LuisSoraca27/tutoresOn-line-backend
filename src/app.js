import express from "express";
import { cors } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
app.disable("x-powered-by");
app.use(cors);
app.use(/^\/api\/v1\/tutores\/[^/]+\/foto$/, express.json({ limit: "700kb" }));
app.use(express.json({ limit: "100kb" }));
app.use("/api/v1", apiRouter);
app.use(notFound);
app.use(errorHandler);
