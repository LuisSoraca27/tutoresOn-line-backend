import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

test("la API responde y permite solicitudes del frontend local", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/v1/health`, {
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.deepEqual(await response.json(), { status: "ok" });
  const missing = await fetch(`${base}/api/v1/no-existe`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { detail: "Ruta no encontrada." });
});

 test("CORS y errores HTTP mantienen el contrato de la API", async (t) => {
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const preflight = await fetch(`${base}/api/v1/auth/login`, {
    method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
  const origenAjeno = await fetch(`${base}/api/v1/health`, { headers: { Origin: "http://ajeno.example" } });
  assert.equal(origenAjeno.headers.get("access-control-allow-origin"), null);
  const jsonInvalido = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(jsonInvalido.status, 400);
  assert.deepEqual(await jsonInvalido.json(), { detail: "El cuerpo JSON no es válido." });
});
