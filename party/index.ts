// PartyKit-сервер присутствия: счётчик «на сайте сейчас» + ретрансляция
// анонимных курсоров (id — только connection.id, никаких имён/кук).
// Деплой (владелец): npx partykit deploy → NEXT_PUBLIC_PARTYKIT_HOST в env.
import type * as Party from "partykit/server";

export default class Presence implements Party.Server {
  constructor(readonly room: Party.Room) {}

  private broadcastCount() {
    const n = Array.from(this.room.getConnections()).length;
    this.room.broadcast(JSON.stringify({ t: "count", n }));
  }

  onConnect() {
    this.broadcastCount();
  }

  onClose(conn: Party.Connection) {
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id }));
    this.broadcastCount();
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const msg = JSON.parse(message);
      if (msg.t === "cursor" && typeof msg.x === "number" && typeof msg.y === "number") {
        // ретранслируем всем, кроме отправителя; координаты клампим
        const x = Math.max(0, Math.min(1, msg.x));
        const y = Math.max(0, Math.min(1, msg.y));
        this.room.broadcast(
          JSON.stringify({ t: "cursor", id: sender.id, x, y }),
          [sender.id],
        );
      }
      // ping — просто keepalive
    } catch {
      /* мусор игнорируем */
    }
  }
}
