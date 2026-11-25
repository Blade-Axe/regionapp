import { Hono, type Context } from "hono";
import { EMPTY } from "./mc-status";
import { legacyToHtml, stripCodes } from "./motd";
import { DEFAULT_COLUMNS, describe, isKey } from "./metrics";
import { normalizeId, parseSkins } from "./skins";

export { McStatus } from "./mc-status";
const app = new Hono<{ Bindings: Env }>();

type PluginPayload = {
	online?: boolean;
	motd?: string;
	version?: string;
	max?: number;
	players?: { name: string; uuid: string }[];
	skins?: Record<string, string>;
};

// Keeps an answer in the cache of Cloudflare. The Durable Object does not run on a hit.
async function cached(
	c: Context<{ Bindings: Env }>,
	seconds: number,
	build: () => Promise<Response>,
): Promise<Response> {
	const cache = caches.default;
	const hit = await cache.match(c.req.url);
	if (hit) return hit;

	const res = await build();
	res.headers.set("Cache-Control", `public, max-age=${seconds}`);
	c.executionCtx.waitUntil(cache.put(c.req.url, res.clone()));
	return res;
}

app.get("/api/minecraft", async (c) => {
	c.header("Cache-Control", "no-store");
	return c.json(await c.env.MC_STATUS.getByName("main").getState());
});

app.get("/api/minecraft/live", (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		return c.text("Expected WebSocket", 426);
	}
	return c.env.MC_STATUS.getByName("main").fetch(c.req.raw);
});

app.get("/api/ping", (c) => c.text("build 2"));

app.get("/map", (c) => c.redirect("/map/", 301));

app.all("/map/*", (c) => fetch(c.req.raw));

app.post("/api/minecraft/update", async (c) => {
	if (!c.env.MC_SECRET || c.req.header("Authorization") !== `Bearer ${c.env.MC_SECRET}`) {
        return c.text("Unauthorized", 401);
    }
	const body = await c.req.json<PluginPayload>();
	const stub = c.env.MC_STATUS.getByName("main");

	const skins = parseSkins(body.skins);
	if (Object.keys(skins).length > 0) await stub.saveSkins(skins);

	if (body.online === false) {
		await stub.setState(EMPTY);
		return c.body(null, 204);
	}

	const players = (body.players ?? []).slice(0, 200).map((p) => ({
		name: String(p.name).slice(0, 32),
		uuid: normalizeId(String(p.uuid)),
		skin: null,
	}));
	const motd = String(body.motd ?? "").slice(0, 500);

	await stub.setState({
		online: true,
		motd: stripCodes(motd),
		motdHtml: legacyToHtml(motd),
		version: String(body.version ?? ""),
		players: { online: players.length, max: Number(body.max) || 0, list: players },
	});
	return c.body(null, 204);
});

app.post("/api/stats/update", async (c) => {
	if (!c.env.MC_SECRET || c.req.header("Authorization") !== `Bearer ${c.env.MC_SECRET}`) {
		return c.text("Unauthorized", 401);
	}
	const body = await c.req.json<{
		players?: { uuid: string; name: string; stats: string }[];
	}>();
	const rows = (body.players ?? [])
		.filter((p) => /^[0-9a-f-]{36}$/i.test(p.uuid))
		.slice(0, 50);
	const stub = c.env.MC_STATUS.getByName("main");
	await stub.savePlayers(rows);
	// The plugin looks up the skins that are missing.
	return c.json({ missing: await stub.missingSkins(rows.map((r) => r.uuid)) });
});

app.post("/api/skins/update", async (c) => {
	if (!c.env.MC_SECRET || c.req.header("Authorization") !== `Bearer ${c.env.MC_SECRET}`) {
		return c.text("Unauthorized", 401);
	}
	const body = await c.req.json<{ skins?: Record<string, string> }>();
	await c.env.MC_STATUS.getByName("main").saveSkins(parseSkins(body.skins));
	return c.body(null, 204);
});

// app.get("/api/leaderboard", (c) =>
// 	cached(c, 60, async () => {
// 		const requested = [
// 			...new Set((c.req.query("columns") ?? "").split(",").filter(isKey)),
// 		].slice(0, 5);
// 		const keys = requested.length > 0 ? requested : DEFAULT_COLUMNS;
// 		const sort = c.req.query("sort") ?? "";

// 		return c.json({
// 			columns: keys.map((key) => describe(key)),
// 			sort: keys.includes(sort) ? sort : keys[0],
// 			rows: await c.env.MC_STATUS.getByName("main").getLeaderboard(keys, sort),
// 		});
// 	}),
// );

app.get("/api/leaderboard", (c) => {
	const raw = c.req.query("columns") ?? "";
	const requested = raw === "" ? [] : [...new Set(raw.split(","))];
	if (requested.length > 5 || !requested.every(isKey)) {
		return c.json({ error: "Bad columns" }, 400);
	}
	return cached(c, 60, async () => {
		const keys = requested.length > 0 ? requested : DEFAULT_COLUMNS; //uses default columns on load
		const sort = c.req.query("sort") ?? ""; //uses the URL
		return c.json({
			columns: keys.map((key) => describe(key)),
			sort: keys.includes(sort) ? sort : keys[0],
			rows: await c.env.MC_STATUS.getByName("main").getLeaderboard(keys, sort),
		});
	});
});

app.get("/api/stats/search", (c) =>
	cached(c, 300, async () =>
		c.json({
			results: await c.env.MC_STATUS.getByName("main").searchCatalog(
				(c.req.query("q") ?? "").slice(0, 60),
			),
		}),
	),
);

app.get("/api/players/:uuid", async (c) => {
	const uuid = c.req.param("uuid");
	if (!/^[0-9a-f-]{36}$/i.test(uuid)) return c.json({ error: "Bad id" }, 400);
	const player = await c.env.MC_STATUS.getByName("main").getPlayer(uuid);
	return player ? c.json(player) : c.json({ error: "Not found" }, 404);
});

app.get("/api/users/:name", (c) =>
	cached(c, 60, async () => {
		const name = c.req.param("name");
		if (!/^[A-Za-z0-9_.-]{1,32}$/.test(name)) return c.json({ error: "Bad name" }, 400);
		const profile = await c.env.MC_STATUS.getByName("main").getProfile(name);
		return profile ? c.json(profile) : c.json({ error: "Not found" }, 404);
	}),
);

// Serves a skin picture. The hash is the content, so the browser can keep it for ever.
app.get("/api/skin/:hash", async (c) => {
	const hash = c.req.param("hash");
	if (!/^[0-9a-f]{16,80}$/i.test(hash)) return c.text("Bad id", 400);

	const upstream = await fetch(`https://textures.minecraft.net/texture/${hash}`, {
		cf: { cacheTtl: 86400, cacheEverything: true },
	});
	if (!upstream.ok) return c.text("Not found", 404);

	return new Response(upstream.body, {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
});

export default app;
