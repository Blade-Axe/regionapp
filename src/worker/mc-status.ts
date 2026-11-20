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

type PlayerRow = {
	uuid: string;
	name: string;
	play_ticks: number;
	deaths: number;
	mob_kills: number;
	blocks_mined: number;
	distance_cm: number;
};

type StatGroups = Record<string, Record<string, number>>;

const SORTS = new Map([
	["playtime", "play_ticks"],
	["deaths", "deaths"],
	["mobs", "mob_kills"],
	["mined", "blocks_mined"],
	["distance", "distance_cm"],
]);

const total = (group: Record<string, number> = {}) =>
	Object.values(group).reduce((sum, value) => sum + value, 0);

export class McStatus extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS players (
				uuid TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				play_ticks INTEGER NOT NULL DEFAULT 0,
				deaths INTEGER NOT NULL DEFAULT 0,
				mob_kills INTEGER NOT NULL DEFAULT 0,
				blocks_mined INTEGER NOT NULL DEFAULT 0,
				distance_cm INTEGER NOT NULL DEFAULT 0,
				stats TEXT NOT NULL,
				updated INTEGER NOT NULL
			)
		`);
	}

	savePlayers(rows: { uuid: string; name: string; stats: string }[]): void {
		for (const row of rows) {
			let groups: StatGroups;
			try {
				groups = (JSON.parse(row.stats) as { stats?: StatGroups }).stats ?? {};
			} catch {
				continue;
			}

			const custom = groups["minecraft:custom"] ?? {};
			const playTicks =
				custom["minecraft:play_time"] ?? custom["minecraft:play_one_minute"] ?? 0;
			const distance = Object.entries(custom)
				.filter(([key]) => key.endsWith("_one_cm") && !key.includes("fall"))
				.reduce((sum, [, value]) => sum + value, 0);

			this.ctx.storage.sql.exec(
				`INSERT INTO players
					(uuid, name, play_ticks, deaths, mob_kills, blocks_mined, distance_cm, stats, updated)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(uuid) DO UPDATE SET
					name = excluded.name,
					play_ticks = excluded.play_ticks,
					deaths = excluded.deaths,
					mob_kills = excluded.mob_kills,
					blocks_mined = excluded.blocks_mined,
					distance_cm = excluded.distance_cm,
					stats = excluded.stats,
					updated = excluded.updated`,
				row.uuid,
				String(row.name).slice(0, 32),
				playTicks,
				custom["minecraft:deaths"] ?? 0,
				custom["minecraft:mob_kills"] ?? 0,
				total(groups["minecraft:mined"]),
				distance,
				JSON.stringify(groups),
				Date.now(),
			);
		}
	}

	getLeaderboard(sort: string, limit = 100) {
		const column = SORTS.get(sort) ?? "play_ticks";
		return this.ctx.storage.sql
			.exec<PlayerRow>(
				`SELECT uuid, name, play_ticks, deaths, mob_kills, blocks_mined, distance_cm
				FROM players ORDER BY ${column} DESC, name LIMIT ?`,
				limit,
			)
			.toArray()
			.map((r) => ({
				uuid: r.uuid,
				name: r.name,
				playTicks: r.play_ticks,
				days: Math.floor(r.play_ticks / 24000),
				deaths: r.deaths,
				mobKills: r.mob_kills,
				blocksMined: r.blocks_mined,
				distanceCm: r.distance_cm,
			}));
	}

	getPlayer(uuid: string) {
		const row = this.ctx.storage.sql
			.exec<{ name: string; stats: string }>(
				"SELECT name, stats FROM players WHERE uuid = ?",
				uuid,
			)
			.toArray()[0];
		return row
			? { name: row.name, stats: JSON.parse(row.stats) as StatGroups }
			: null;
	}
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