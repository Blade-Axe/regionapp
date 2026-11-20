import { useEffect, useState } from "react";

export const THEMES = [
	{ id: "dark", label: "Dark", icon: "mc-black-dye" },
	{ id: "light", label: "Light", icon: "mc-white-dye" },
	{ id: "overworld", label: "Overworld", icon: "mc-green-dye" },
	{ id: "underground", label: "Underground", icon: "mc-gray-dye" },
	{ id: "nether", label: "Nether", icon: "mc-red-dye" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.id === v);

function getInitialTheme(): Theme {
	const saved = localStorage.getItem("theme");
	if (isTheme(saved)) return saved;
	return window.matchMedia("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";
}

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(getInitialTheme);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		localStorage.setItem("theme", theme);
	}, [theme]);

	return { theme, setTheme, themes: THEMES };
}