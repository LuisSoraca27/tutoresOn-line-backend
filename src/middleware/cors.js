import { config } from "../config/env.js";

export function cors(req, res, next) {
  res.vary("Origin");
  if (req.get("Origin") === config.frontendOrigin) {
    res.set("Access-Control-Allow-Origin", config.frontendOrigin);
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}
