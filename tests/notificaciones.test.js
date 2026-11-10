import test from "node:test";
import assert from "node:assert/strict";
import { crearNotificacion } from "../src/modules/notificaciones/notificaciones.service.js";

test("guarda el aviso en la transacción y conserva sus datos", async () => {
  let guardada;
  const tx = { notification: { create: async ({ data }) => { guardada = data; return data; } } };
  const aviso = { destinatarioId: "tutor-1", tipo: "new_booking", titulo: "Nueva solicitud", detalle: "Tienes una reserva", enlace: "/tutor/solicitudes" };
  const resultado = await crearNotificacion(tx, aviso);
  assert.match(guardada.id, /^n-/);
  assert.equal(guardada.recipientId, aviso.destinatarioId);
  assert.equal(guardada.type, aviso.tipo);
  assert.equal(guardada.title, aviso.titulo);
  assert.equal(guardada.detail, aviso.detalle);
  assert.equal(guardada.link, aviso.enlace);
  assert.equal(resultado, guardada);
});
