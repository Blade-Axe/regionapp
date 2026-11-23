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
export async function lookupSkin(id: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://sessionserver.mojang.com/session/minecraft/profile/${id}`,
		);
		if (res.status !== 200) return null;
		const profile = (await res.json()) as {
			properties?: { name: string; value: string }[];
		};
		const value = profile.properties?.find((p) => p.name === "textures")?.value;
		return value ? skinHashFrom(value) : null;
	} catch {
		return null;
	}
}