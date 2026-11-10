import test from "node:test";
import assert from "node:assert/strict";
import { subirFoto } from "../src/storage/r2.js";

test("la subida informa cuando R2 no está configurado", async () => {
  const nombres = ["R2_ENDPOINT", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const anterior = Object.fromEntries(nombres.map((nombre) => [nombre, process.env[nombre]]));
  for (const nombre of nombres) delete process.env[nombre];
  try {
    await assert.rejects(subirFoto("avatars/test", Buffer.from("x"), "image/png"), (error) => error.status === 503 && /no está configurado/.test(error.message));
  } finally {
    for (const nombre of nombres) if (anterior[nombre] !== undefined) process.env[nombre] = anterior[nombre];
  }
});
