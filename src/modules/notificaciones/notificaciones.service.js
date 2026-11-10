import { randomUUID } from "node:crypto";
export async function crearNotificacion(db, { destinatarioId, tipo, titulo, detalle, enlace }) {
  return db.notification.create({ data: { id: `n-${randomUUID()}`, recipientId: destinatarioId, type: tipo, title: titulo, detail: detalle, link: enlace } });
}
