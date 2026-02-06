import { useQuery } from "@tanstack/react-query";

export type AgentInfo = {
	name: string;
	description: string;
	status: "idle" | "working";
};

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

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

export const agentKeys = {
	all: ["agents"] as const,
	files: (name: string) => ["agents", name, "files"] as const,
	file: (name: string, path: string) => ["agents", name, "file", path] as const,
};

export function useAgents() {
	return useQuery({
		queryKey: agentKeys.all,
		queryFn: () =>
			fetchJson<{ agents: AgentInfo[] }>("/api/agents").then((d) => d.agents),
	});
}

export function useAgentFiles(name: string | undefined) {
	return useQuery({
		queryKey: agentKeys.files(name!),
		queryFn: () =>
			fetchJson<{ tree: FileTreeNode[] }>(`/api/agents/${name}/files`).then(
				(d) => d.tree ?? [],
			),
		enabled: !!name,
	});
}

export function useAgentFile(
	name: string | undefined,
	path: string | undefined,
	isDirectory: boolean,
) {
	return useQuery({
		queryKey: agentKeys.file(name!, path!),
		queryFn: () =>
			fetchJson<FileContent>(
				`/api/agents/${name}/file?path=${encodeURIComponent(path!)}`,
			),
		enabled: !!name && !!path && !isDirectory,
	});
}
