import test from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../src/middleware/errors.js";

test("una base de datos inaccesible devuelve un mensaje útil", () => {
  const error = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
  let status;
  let body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  const log = console.error;
  console.error = () => {};
  try { errorHandler(error, {}, res, () => {}); } finally { console.error = log; }
  assert.equal(status, 503);
  assert.match(body.detail, /base de datos no está disponible/i);
});
