import { DurableObject } from "cloudflare:workers";

export type McState = {
	online: boolean;
	motd: string;
	motdHtml: string;
	version: string;
	players: { online: number; max: number; list: string[] };
};

export const EMPTY: McState = {
	online: false,
	motd: "",
	motdHtml: "",
	version: "",
	players: { online: 0, max: 0, list: [] },
};

export class McStatus extends DurableObject<Env> {
	async getState(): Promise<McState> {
		return (await this.ctx.storage.get<McState>("state")) ?? EMPTY;
	}

	async setState(next: McState): Promise<void> {
		const prev = await this.getState();
		await this.ctx.storage.put("state", next);
		if (next.online) {
			await this.ctx.storage.setAlarm(Date.now() + 120_000);
		} else {
			await this.ctx.storage.deleteAlarm();
		}
		if (JSON.stringify(prev) !== JSON.stringify(next)) {
			this.broadcast(next);
		}
	}

	webSocketError(ws: WebSocket) :void {
		ws.close();
	}

	async alarm(): Promise<void> {
		await this.setState(EMPTY);
	}

	async fetch(): Promise<Response> {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		server.send(JSON.stringify(await this.getState()));
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketClose(ws: WebSocket): void {
		ws.close();
	}

	private broadcast(state: McState): void {
		const message = JSON.stringify(state);
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(message);
			} catch {
				// The socket is already closed.
			}
		}
	}
}