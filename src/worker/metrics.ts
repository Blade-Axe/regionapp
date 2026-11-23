export type Kind = "time" | "distance" | "tenths" | "count";
export type Groups = Record<string, Record<string, number>>;
export type Flat = Record<string, number>;
export type Meta = { key: string; label: string; group: string; kind: Kind };

const NAMES: Record<string, string> = {
	jump: "Jumps",
	drop: "Items dropped",
	deaths: "Deaths",
	mob_kills: "Mobs killed",
	player_kills: "Players killed",
	leave_game: "Times left the game",
	enchant_item: "Items enchanted",
	fish_caught: "Fish caught",
	target_hit: "Targets hit",
	play_record: "Music discs played",
};

const nameOf = (id: string) => {
	const text = (NAMES[id] ?? id).replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

const TIME = [
	"play_time",
	"total_world_time",
	"sneak_time",
	"time_since_death",
	"time_since_rest",
];

const DISTANCE: [string, string][] = [
	["walk", "Walked"],
	["sprint", "Sprinted"],
	["crouch", "Crouched"],
	["swim", "Swum"],
	["walk_on_water", "Walked on water"],
	["walk_under_water", "Walked under water"],
	["fall", "Fallen"],
	["climb", "Climbed"],
	["fly", "Flown"],
	["aviate", "Flown with elytra"],
	["boat", "By boat"],
	["minecart", "By minecart"],
	["horse", "By horse"],
	["pig", "By pig"],
	["strider", "By strider"],
	["nautilus", "By nautilus"],
];

const COMBAT = ["deaths", "mob_kills", "player_kills"];

const DAMAGE = [
	"damage_dealt",
	"damage_dealt_absorbed",
	"damage_dealt_resisted",
	"damage_taken",
	"damage_blocked_by_shield",
	"damage_absorbed",
	"damage_resisted",
];

const ACTIVITY = [
	"jump",
	"drop",
	"leave_game",
	"animals_bred",
	"fish_caught",
	"talked_to_villager",
	"traded_with_villager",
	"target_hit",
	"sleep_in_bed",
	"raid_trigger",
	"raid_win",
	"bell_ring",
	"enchant_item",
	"play_noteblock",
	"tune_noteblock",
	"pot_flower",
	"eat_cake_slice",
	"play_record",
];

const STATIONS = [
	"open_chest",
	"open_enderchest",
	"open_barrel",
	"open_shulker_box",
	"trigger_trapped_chest",
	"inspect_dropper",
	"inspect_hopper",
	"inspect_dispenser",
	"fill_cauldron",
	"use_cauldron",
	"clean_armor",
	"clean_banner",
	"clean_shulker_box",
	"interact_with_furnace",
	"interact_with_blast_furnace",
	"interact_with_smoker",
	"interact_with_crafting_table",
	"interact_with_brewingstand",
	"interact_with_beacon",
	"interact_with_campfire",
	"interact_with_cartography_table",
	"interact_with_lectern",
	"interact_with_loom",
	"interact_with_stonecutter",
	"interact_with_anvil",
	"interact_with_grindstone",
	"interact_with_smithing_table",
];

const strip = (id: string) => id.replace(/^minecraft:/, "");
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const CATEGORIES: Record<string, string> = {
	mined: "Mined",
	broken: "Broken",
	crafted: "Crafted",
	used: "Used",
	picked_up: "Picked up",
	dropped: "Dropped",
	killed: "Killed",
	killed_by: "Killed by",
};

const GROUPS: Record<string, string> = {
	mined: "Blocks mined",
	broken: "Items broken",
	crafted: "Items crafted",
	used: "Items used",
	picked_up: "Items picked up",
	dropped: "Items dropped",
	killed: "Mobs killed",
	killed_by: "Killed by mobs",
};

const TOTALS: [string, string][] = [
	["mined", "Blocks mined"],
	["crafted", "Items crafted"],
	["used", "Items used"],
	["broken", "Items broken"],
	["picked_up", "Items picked up"],
	["killed_by", "Times killed by mobs"],
];

const custom = (
	id: string,
	group: string,
	kind: Kind,
	label = nameOf(id),
): Meta => ({ key: `custom:${id}`, label, group, kind });

export const BUILTIN: Meta[] = [
	...TIME.map((id) => custom(id, "Time", "time")),
	{ key: "total:days", label: "In-game days played", group: "Time", kind: "count" },
	{ key: "total:distance", label: "Total distance", group: "Travel", kind: "distance" },
	...DISTANCE.map(([id, label]) =>
		custom(`${id}_one_cm`, "Travel", "distance", label),
	),
	...COMBAT.map((id) => custom(id, "Combat", "count")),
	...DAMAGE.map((id) => custom(id, "Combat", "tenths")),
	...ACTIVITY.map((id) => custom(id, "Activity", "count")),
	...STATIONS.map((id) => custom(id, "Containers and stations", "count")),
	...TOTALS.map(([id, label]): Meta => ({
		key: `total:${id}`,
		label,
		group: "Totals",
		kind: "count",
	})),
];

const BUILTIN_MAP = new Map(BUILTIN.map((m): [string, Meta] => [m.key, m]));

export const isBuiltin = (key: string) => BUILTIN_MAP.has(key);

export const isKey = (key: string) =>
	/^[a-z0-9_]+:[a-z0-9_.:/-]{1,100}$/i.test(key);

// The five columns that show before a visitor changes anything.
export const DEFAULT_COLUMNS = [
	"custom:play_time",
	"custom:deaths",
	"custom:mob_kills",
	"total:mined",
];

const kindOfCustom = (id: string): Kind => {
	if (id.endsWith("_one_cm")) return "distance";
	if (id.includes("time") || id === "play_one_minute") return "time";
	if (id.startsWith("damage_")) return "tenths";
	return "count";
};

export function describe(key: string): Meta {
	const known = BUILTIN_MAP.get(key);
	if (known) return known;

	const cut = key.indexOf(":");
	const category = key.slice(0, cut);
	const id = key.slice(cut + 1);

	if (category === "custom") {
		return { key, label: nameOf(id), group: "General", kind: kindOfCustom(id) };
	}
	return {
		key,
		label: `${CATEGORIES[category] ?? cap(category)}: ${cap(id.replace(/[_:]/g, " "))}`,
		group: GROUPS[category] ?? cap(category),
		kind: "count",
	};
}

// Turns the nested file of the game into one flat list. Keys look like
// "mined:diamond_ore" or "custom:play_time". Totals start with "total:".
export function flatten(groups: Groups): Flat {
	const flat: Flat = {};
	for (const [category, entries] of Object.entries(groups)) {
		for (const [id, value] of Object.entries(entries)) {
			if (typeof value === "number") {
				flat[`${strip(category)}:${strip(id)}`] = value;
			}
		}
	}

	if (flat["custom:play_time"] === undefined && flat["custom:play_one_minute"] !== undefined) {
		flat["custom:play_time"] = flat["custom:play_one_minute"];
	}

	const sum = (match: (key: string) => boolean) =>
		Object.entries(flat)
			.filter(([key]) => match(key))
			.reduce((total, [, value]) => total + value, 0);

	flat["total:days"] = Math.floor((flat["custom:play_time"] ?? 0) / 24000);
	flat["total:distance"] = sum(
		(k) =>
			k.startsWith("custom:") &&
			k.endsWith("_one_cm") &&
			!k.includes("fall") &&
			!k.includes("climb"),
	);
	for (const [category] of TOTALS) {
		flat[`total:${category}`] = sum((k) => k.startsWith(`${category}:`));
	}
	return flat;
}

// The reverse of flatten. The player detail view uses it.
export function nest(flat: Flat): Groups {
	const groups: Groups = {};
	for (const [key, value] of Object.entries(flat)) {
		const cut = key.indexOf(":");
		const category = key.slice(0, cut);
		if (category === "total") continue;
		const group = groups[category] ?? (groups[category] = {});
		group[key.slice(cut + 1)] = value;
	}
	return groups;
}