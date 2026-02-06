import { readdirSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

export type FileTreeNode = {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: FileTreeNode[];
};

const EXT_TO_LANGUAGE: Record<string, string> = {
	".ts": "typescript",
	".tsx": "tsx",
	".js": "javascript",
	".jsx": "jsx",
	".json": "json",
	".md": "markdown",
	".css": "css",
	".html": "html",
	".yaml": "yaml",
	".yml": "yaml",
	".toml": "toml",
	".sh": "bash",
	".py": "python",
	".rb": "ruby",
	".rs": "rust",
	".go": "go",
	".sql": "sql",
	".graphql": "graphql",
	".xml": "xml",
	".svg": "xml",
	".txt": "text",
};

export function getLanguageFromFilename(filename: string): string {
	return EXT_TO_LANGUAGE[extname(filename).toLowerCase()] ?? "text";
}

export function scanFileTree(dir: string, relativeTo: string): FileTreeNode[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const nodes: FileTreeNode[] = [];

	for (const entry of entries) {
		// Skip git and OS metadata
		if (entry.name === ".git" || entry.name === ".DS_Store") continue;

		const fullPath = `${dir}/${entry.name}`;
		const relativePath = fullPath.slice(relativeTo.length + 1);

		if (entry.isDirectory()) {
			const children = scanFileTree(fullPath, relativeTo);
			nodes.push({
				name: entry.name,
				path: relativePath,
				type: "directory",
				children,
			});
		} else {
			nodes.push({
				name: entry.name,
				path: relativePath,
				type: "file",
			});
		}
	}

	// Sort: directories first, then files, alphabetically within each group
	nodes.sort((a, b) => {
		if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	return nodes;
}

export function isPathSafe(basePath: string, requestedPath: string): boolean {
	const resolved = resolve(basePath, requestedPath);
	return resolved.startsWith(resolve(basePath));
}
