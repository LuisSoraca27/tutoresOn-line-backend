import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../../database/prisma.js";
import { config } from "../../config/env.js";

const tickets = new Map();
const conexiones = new Map();
export function crearTicket(session) {
  const now = Date.now();
  for (const [ticket, valor] of tickets) if (valor.expira <= now) tickets.delete(ticket);
  const ticket = randomBytes(32).toString("base64url");
  tickets.set(ticket, { userId: session.userId, role: session.user.role, tokenHash: session.tokenHash, expira: now + 30000 });
  return ticket;
}
export function avisarCambio() {
  const data = JSON.stringify({ tipo: "cambio" });
  for (const ws of conexiones.keys()) if (ws.readyState === WebSocket.OPEN) { try { ws.send(data); } catch { ws.terminate(); } }
}
export function tutoresConectados() {
  return [...new Set([...conexiones.values()].filter((c) => c.role === "tutor" && c.disponible).map((c) => c.userId))];
}
export function conectarRealtime(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const upgrade = async (req, socket, head) => {
    socket.on("error", () => {});
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/v1/express/socket") return socket.destroy();
    const ticket = url.searchParams.get("ticket");
    const identidad = ticket ? tickets.get(ticket) : null;
    if (ticket) tickets.delete(ticket);
    if (req.headers.origin !== config.frontendOrigin || !identidad || identidad.expira <= Date.now()) return socket.destroy();
    try {
      const sesion = await prisma.authSession.findUnique({ where: { tokenHash: identidad.tokenHash }, select: { userId: true, expiresAt: true } });
      if (!sesion || sesion.userId !== identidad.userId || sesion.expiresAt <= new Date()) return socket.destroy();
      if (socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        conexiones.set(ws, { ...identidad, disponible: false });
        ws.on("error", () => {});
        ws.on("message", async (raw, binary) => {
          if (binary) return ws.close(1003);
          let msg;
          try { msg = JSON.parse(raw.toString()); } catch { return ws.close(1007); }
          if (identidad.role !== "tutor" || msg?.tipo !== "disponible" || typeof msg.valor !== "boolean" || Object.keys(msg).length !== 2) return ws.close(1008);
          try {
            const actual = await prisma.authSession.findUnique({ where: { tokenHash: identidad.tokenHash }, select: { expiresAt: true } });
            if (!actual || actual.expiresAt <= new Date()) return ws.close(1008);
            const conexion = conexiones.get(ws);
            if (conexion) { conexion.disponible = msg.valor; avisarCambio(); }
          } catch { ws.close(1011); }
        });
        ws.on("close", () => { conexiones.delete(ws); avisarCambio(); });
        ws.send(JSON.stringify({ tipo: "conectado" }));
      });
    } catch { socket.destroy(); }
  };
  server.on("upgrade", upgrade);
  const verificar = setInterval(async () => {
    for (const [ws, c] of conexiones) {
      try {
        const sesion = await prisma.authSession.findUnique({ where: { tokenHash: c.tokenHash }, select: { expiresAt: true } });
        if (!sesion || sesion.expiresAt <= new Date()) ws.close(1008);
        else if (ws.isAlive === false) ws.terminate();
        else { ws.isAlive = false; ws.once("pong", () => { ws.isAlive = true; }); ws.ping(); }
      } catch { ws.close(1011); }
    }
  }, 30000);
  verificar.unref();
  return () => { clearInterval(verificar); server.off("upgrade", upgrade); for (const ws of wss.clients) ws.terminate(); wss.close(); };
}
