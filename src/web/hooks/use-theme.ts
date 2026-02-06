import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): Resolved {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system")
		return stored;
	return "system";
}

function resolve(theme: Theme): Resolved {
	return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: Theme) {
	const resolved = resolve(theme);
	document.documentElement.classList.toggle("dark", resolved === "dark");
}

let listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): Theme {
	return getStoredTheme();
}

function setTheme(theme: Theme) {
	localStorage.setItem(STORAGE_KEY, theme);
	applyTheme(theme);
	for (const listener of listeners) listener();
}

// Listen for system theme changes so "system" mode stays reactive
const mq = window.matchMedia("(prefers-color-scheme: dark)");
mq.addEventListener("change", () => {
	if (getStoredTheme() === "system") {
		applyTheme("system");
		for (const listener of listeners) listener();
	}
});

export function useTheme() {
	const theme = useSyncExternalStore(subscribe, getSnapshot);
	const resolved = resolve(theme);

	return { theme, setTheme, resolved } as const;
}
