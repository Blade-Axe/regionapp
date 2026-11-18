import { Hono } from "hono";
import { EMPTY } from "./mc-status";
import { legacyToHtml, stripCodes } from "./motd";

export { McStatus } from "./mc-status";
const app = new Hono<{ Bindings: Env }>();

type PluginPayload = {
	online?: boolean;
	motd?: string;
	version?: string;
	max?: number;
	players?: string[];
};

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

app.all("/map/*", async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname.replace(/^\/map/, "") || "/";
  const target = new URL(path + url.search, "https://mc.region.obphi.com");
  return fetch(new Request(target, c.req.raw));
});

app.post("/api/minecraft/update", async (c) => {
	if (!c.env.MC_SECRET || c.req.header("Authorization") !== `Bearer ${c.env.MC_SECRET}`) {
        return c.text("Unauthorized", 401);
    }
	const body = await c.req.json<PluginPayload>();
	const stub = c.env.MC_STATUS.getByName("main");

	if (body.online === false) {
		await stub.setState(EMPTY);
		return c.body(null, 204);
	}

	const names = (body.players ?? []).slice(0, 200).map(String);
	const motd = String(body.motd ?? "").slice(0, 500);

	await stub.setState({
		online: true,
		motd: stripCodes(motd),
		motdHtml: legacyToHtml(motd),
		version: String(body.version ?? ""),
		players: { online: names.length, max: Number(body.max) || 0, list: names },
	});
	return c.body(null, 204);
});

export default app;
