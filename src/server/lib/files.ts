import { readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";

export type FileTreeNode = {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: FileTreeNode[];
};

export type FileContent = {
	content: string;
	filename: string;
	language: string;
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

const IGNORED_DIRS = new Set([
	".git",
	".DS_Store",
	"node_modules",
	".cache",
	"dist",
	".next",
	"__pycache__",
	".venv",
	"venv",
]);

const MAX_DEPTH = 10;

export function getLanguageFromFilename(filename: string): string {
	return EXT_TO_LANGUAGE[extname(filename).toLowerCase()] ?? "text";
}

export async function scanFileTree(
	dir: string,
	relativeTo: string,
	depth = 0,
): Promise<FileTreeNode[]> {
	if (depth >= MAX_DEPTH) return [];

	const entries = await readdir(dir, { withFileTypes: true });
	const nodes: FileTreeNode[] = [];

	for (const entry of entries) {
		if (IGNORED_DIRS.has(entry.name)) continue;

		const fullPath = `${dir}/${entry.name}`;
		const relativePath = fullPath.slice(relativeTo.length + 1);

		if (entry.isDirectory()) {
			const children = await scanFileTree(fullPath, relativeTo, depth + 1);
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

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function isAgentNameSafe(name: string): boolean {
	return SAFE_NAME_RE.test(name);
}

/**
 * Returns true if the file appears to be binary by checking for null bytes
 * in the first 8KB of content.
 */
export function isBinaryFile(buffer: Buffer): boolean {
	const length = Math.min(buffer.length, 8192);
	for (let i = 0; i < length; i++) {
		if (buffer[i] === 0) return true;
	}
	return false;
}
