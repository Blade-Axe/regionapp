import { DurableObject } from "cloudflare:workers";
import {
	BUILTIN,
	describe,
	flatten,
	isBuiltin,
	isKey,
	nest,
	type Flat,
	type Groups,
	type Meta,
} from "./metrics";

export type McPlayer = { name: string; uuid: string; skin: string | null };

export type McState = {
	online: boolean;
	motd: string;
	motdHtml: string;
	version: string;
	players: { online: number; max: number; list: McPlayer[] };
};

export const EMPTY: McState = {
	online: false,
	motd: "",
	motdHtml: "",
	version: "",
	players: { online: 0, max: 0, list: [] },
};

// The server is offline when the plugin sends nothing for this long.
// Use at least 3 times the heartbeat of the plugin.
const OFFLINE_AFTER_MS = 180_000;

export class McStatus extends DurableObject<Env> {
	// These two lists live in memory. Each one is also stored as ONE value.
	// A cold start reads 2 rows. The old code read one row for every statistic name.
	private catalog = new Set<string>();
	private skins = new Map<string, string>();
		// A copy of every player row. It is cleared when a row changes.
	private everyone: { uuid: string; name: string; flat: Flat }[] | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS player_flat (
				uuid TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				flat TEXT NOT NULL,
				updated INTEGER NOT NULL
			)
		`);

		ctx.blockConcurrencyWhile(async () => {
			const [catalog, skins] = await Promise.all([
				ctx.storage.get<string[]>("catalog"),
				ctx.storage.get<Record<string, string>>("skins"),
			]);
			if (catalog === undefined && skins === undefined) {
				await this.migrate();
				return;
			}
			this.catalog = new Set(catalog ?? []);
			this.skins = new Map(Object.entries(skins ?? {}));
		});
	}

	// Runs one time. It copies the two old tables into two stored values.
	// Then it deletes the tables. You can delete this method after one deploy.
	private async migrate(): Promise<void> {
		const sql = this.ctx.storage.sql;
		let keys: string[] = [];
		let skins: Record<string, string> = {};
		try {
			keys = sql
				.exec<{ key: string }>("SELECT key FROM catalog")
				.toArray()
				.map((r) => r.key)
				.sort();
			skins = Object.fromEntries(
				sql
					.exec<{ uuid: string; hash: string }>("SELECT uuid, hash FROM skins")
					.toArray()
					.map((r) => [r.uuid, r.hash]),
			);
		} catch {
			// The old tables do not exist. Start with empty lists.
		}
		await this.ctx.storage.put({ catalog: keys, skins });
		this.catalog = new Set(keys);
		this.skins = new Map(Object.entries(skins));
		sql.exec("DROP TABLE IF EXISTS catalog");
		sql.exec("DROP TABLE IF EXISTS skins");
	}

	async savePlayers(
		rows: { uuid: string; name: string; stats: string }[],
	): Promise<void> {
		const sql = this.ctx.storage.sql;
		let added = false;

		for (const row of rows) {
			let flat: Flat;
			try {
				flat = flatten((JSON.parse(row.stats) as { stats?: Groups }).stats ?? {});
			} catch {
				continue;
			}

			const name = String(row.name).slice(0, 32);
			const json = JSON.stringify(flat);

			// Do not write a row that did not change. This saves most of the writes,
			// because most players are offline and their statistics stay the same.
			const old = sql
				.exec<{ name: string; flat: string }>(
					"SELECT name, flat FROM player_flat WHERE uuid = ?",
					row.uuid,
				)
				.toArray()[0];
			if (old && old.name === name && old.flat === json) continue;

			sql.exec(
				`INSERT INTO player_flat (uuid, name, flat, updated)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT(uuid) DO UPDATE SET
					name = excluded.name,
					flat = excluded.flat,
					updated = excluded.updated`,
				row.uuid,
				name,
				json,
				Date.now(),
			);

			this.everyone = null;

			// Remember every new statistic name. The search uses this list.
			for (const key of Object.keys(flat)) {
				if (
					this.catalog.has(key) ||
					isBuiltin(key) ||
					key.startsWith("total:") ||
					!isKey(key)
				) {
					continue;
				}
				this.catalog.add(key);
				added = true;
			}
		}

		if (added) {
			await this.ctx.storage.put("catalog", [...this.catalog].sort());
		}
	}

	async saveSkins(skins: Record<string, string>): Promise<void> {
		let changed = false;
		for (const [uuid, hash] of Object.entries(skins)) {
			if (this.skins.get(uuid) !== hash) {
				this.skins.set(uuid, hash);
				changed = true;
			}
		}
		if (changed) {
			await this.ctx.storage.put("skins", Object.fromEntries(this.skins));
		}
	}

	// Returns the players of this list that have no stored skin.
	missingSkins(uuids: string[]): string[] {
		return uuids.filter((u) => !this.skins.has(u.replace(/-/g, "").toLowerCase()));
	}

	getLeaderboard(columns: string[], sort: string, limit = 100) {
		const index = Math.max(0, columns.indexOf(sort));
		return this.ctx.storage.sql
			.exec<{ uuid: string; name: string; flat: string }>(
				"SELECT uuid, name, flat FROM player_flat",
			)
			.toArray()
			.map((r) => {
				const flat = JSON.parse(r.flat) as Flat;
				return {
					uuid: r.uuid,
					name: r.name,
					values: columns.map((key) => flat[key] ?? 0),
					skin: this.skins.get(r.uuid.replace(/-/g, "").toLowerCase()) ?? null,
				};
			})
			.sort((a, b) => b.values[index] - a.values[index] || a.name.localeCompare(b.name))
			.slice(0, limit);
	}

	// The search reads the list in memory. It does not read any database rows.
	searchCatalog(query: string, limit = 100): Meta[] {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
		const matchesAll = (text: string) => terms.every((t) => text.includes(t));

		const builtin = BUILTIN.filter((m) => matchesAll(`${m.key} ${m.label}`.toLowerCase()));
		if (terms.length === 0) return builtin;

		const found: Meta[] = [];
		for (const key of this.catalog) {
			if (found.length >= limit) break;
			if (matchesAll(key.toLowerCase())) found.push(describe(key));
		}
		return [...builtin, ...found].slice(0, limit);
	}

	getPlayer(uuid: string) {
		const row = this.ctx.storage.sql
			.exec<{ name: string; flat: string }>(
				"SELECT name, flat FROM player_flat WHERE uuid = ?",
				uuid,
			)
			.toArray()[0];
		return row ? { name: row.name, stats: nest(JSON.parse(row.flat) as Flat) } : null;
	}

	// Reads all rows one time. Later calls use the copy in memory.
	private loadEveryone() {
		if (!this.everyone) {
			this.everyone = this.ctx.storage.sql
				.exec<{ uuid: string; name: string; flat: string }>(
					"SELECT uuid, name, flat FROM player_flat",
				)
				.toArray()
				.map((r) => ({ uuid: r.uuid, name: r.name, flat: JSON.parse(r.flat) as Flat }));
		}
		return this.everyone;
	}

	// All statistics of one player, each with its rank among all players.
	getProfile(name: string) {
		const all = this.loadEveryone();
		const lower = name.toLowerCase();
		const me = all.find((p) => p.name.toLowerCase() === lower);
		if (!me) return null;

		type Above = { name: string; value: number } | null;
		const stats: Record<
			string,
			Record<string, { value: number; rank: number; above: Above }>
		> = {};
		for (const [key, value] of Object.entries(me.flat)) {
			let rank = 1;
			// The nearest player above is the one with the lowest value that is still higher.
			let above: Above = null;
			for (const other of all) {
				const theirs = other.flat[key] ?? 0;
				if (theirs > value) {
					rank++;
					if (!above || theirs < above.value) {
						above = { name: other.name, value: theirs };
					}
				}
			}
			const cut = key.indexOf(":");
			const category = key.slice(0, cut);
			(stats[category] ??= {})[key.slice(cut + 1)] = { value, rank, above };
		}

		return {
			uuid: me.uuid,
			name: me.name,
			skin: this.skins.get(me.uuid.replace(/-/g, "").toLowerCase()) ?? null,
			stats,
		};
	}

	async getState(): Promise<McState> {
		return (await this.ctx.storage.get<McState>("state")) ?? EMPTY;
	}

	async setState(incoming: McState): Promise<void> {
		const next: McState = {
			...incoming,
			players: {
				...incoming.players,
				list: incoming.players.list.map((p) => ({
					...p,
					skin: this.skins.get(p.uuid) ?? null,
				})),
			},
		};

		const prev = await this.getState();
		// Write and send only when something changed. A heartbeat changes nothing.
		if (JSON.stringify(prev) !== JSON.stringify(next)) {
			await this.ctx.storage.put("state", next);
			this.broadcast(next);
		}
		if (next.online) {
			await this.ctx.storage.setAlarm(Date.now() + OFFLINE_AFTER_MS);
		} else {
			await this.ctx.storage.deleteAlarm();
		}
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

	webSocketError(ws: WebSocket): void {
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