// 문더스트리 협동 모드 — 방 단위 WebSocket 릴레이
// 첫 접속자가 호스트(시뮬레이션 실행), 이후 접속자는 게스트(입력 전송 + 상태 수신)
export class RoomDO {
  constructor(state, env) {
    this.host = null;
    this.guests = new Set();
  }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket')
      return new Response('websocket expected', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const isHost = !this.host || this.host.readyState !== 1;
    if (isHost) this.host = server;
    else {
      this.guests.add(server);
      try { this.host.send(JSON.stringify({ t: 'guest-join' })); } catch {}
    }
    server.send(JSON.stringify({ t: 'role', role: isHost ? 'host' : 'guest' }));
    server.addEventListener('message', ev => {
      if (isHost) { for (const g of this.guests) { try { g.send(ev.data); } catch {} } }
      else { try { this.host?.send(ev.data); } catch {} }
    });
    server.addEventListener('close', () => {
      if (isHost) {
        this.host = null;
        for (const g of this.guests) { try { g.send(JSON.stringify({ t: 'host-left' })); } catch {} }
      } else this.guests.delete(server);
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9-]{3,20})$/);
    if (m) {
      const id = env.ROOM.idFromName(m[1].toLowerCase());
      return env.ROOM.get(id).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};
