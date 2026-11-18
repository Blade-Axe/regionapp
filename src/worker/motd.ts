const COLORS: Record<string, string> = {
	"0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
	"4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
	"8": "#555555", "9": "#5555FF", a: "#55FF55", b: "#55FFFF",
	c: "#FF5555", d: "#FF55FF", e: "#FFFF55", f: "#FFFFFF",
};

export const stripCodes = (s: string) =>
	s.replace(/§x(?:§[0-9a-f]){6}|§[0-9a-fk-or]/gi, "");

const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function legacyToHtml(input: string): string {
	let color = "";
	let bold = false;
	let italic = false;
	let underline = false;
	let strike = false;
	let out = "";

	const tokens = input.match(/§x(?:§[0-9a-f]){6}|§[0-9a-fk-or]|§|[^§]+/gi) ?? [];

	for (const token of tokens) {
		if (!token.startsWith("§")) {
			const decorations = [underline && "underline", strike && "line-through"]
				.filter(Boolean)
				.join(" ");
			const style = [
				color && `color:${color}`,
				bold && "font-weight:bold",
				italic && "font-style:italic",
				decorations && `text-decoration:${decorations}`,
			]
				.filter(Boolean)
				.join(";");
			const html = escapeHtml(token).replace(/\n/g, "<br>");
			out += style ? `<span style="${style}">${html}</span>` : html;
		} else if (token.length === 1) {
			continue;
		} else if (token[1].toLowerCase() === "x") {
			color = "#" + token.slice(2).replace(/§/g, "");
			bold = italic = underline = strike = false;
		} else {
			const code = token[1].toLowerCase();
			if (COLORS[code]) {
				color = COLORS[code];
				bold = italic = underline = strike = false;
			} else if (code === "l") bold = true;
			else if (code === "o") italic = true;
			else if (code === "n") underline = true;
			else if (code === "m") strike = true;
			else if (code === "r") {
				color = "";
				bold = italic = underline = strike = false;
			}
		}
	}
	return out;
}