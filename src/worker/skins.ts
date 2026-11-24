const SKIN_URL = /^https?:\/\/textures\.minecraft\.net\/texture\/([0-9a-f]{16,80})$/i;

type Textures = { textures?: { SKIN?: { url?: string } } };

// Reads the base64 "textures" value of a profile. Returns the hash of the skin.
export function skinHashFrom(value: string): string | null {
	try {
		const data = JSON.parse(atob(value)) as Textures;
		const match = SKIN_URL.exec(data.textures?.SKIN?.url ?? "");
		return match ? match[1].toLowerCase() : null;
	} catch {
		return null;
	}
}

export const normalizeId = (id: string) => id.replace(/-/g, "").toLowerCase();
export const isId = (id: string) => /^[0-9a-f]{32}$/.test(id);

// Fallback for players that the plugin has not seen yet.
// Reads a list of uuid -> base64 "textures" value. Returns uuid -> skin hash.
export function parseSkins(raw: Record<string, string> | undefined): Record<string, string> {
	const skins: Record<string, string> = {};
	for (const [rawId, value] of Object.entries(raw ?? {}).slice(0, 100)) {
		const id = normalizeId(rawId);
		const hash = isId(id) ? skinHashFrom(String(value)) : null;
		if (hash) skins[id] = hash;
	}
	return skins;
}