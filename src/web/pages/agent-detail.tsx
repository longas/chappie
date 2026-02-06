import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import type { BundledLanguage } from "shiki";
import {
	CodeBlock,
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockFilename,
	CodeBlockHeader,
	CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
	FileTree,
	FileTreeFile,
	FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type FileTreeNode,
	useAgentFile,
	useAgentFiles,
} from "@/hooks/use-agents";

function TreeNodes({ nodes }: { nodes: FileTreeNode[] }) {
	return nodes.map((node) => {
		if (node.type === "directory") {
			return (
				<FileTreeFolder key={node.path} name={node.name} path={node.path}>
					{node.children && <TreeNodes nodes={node.children} />}
				</FileTreeFolder>
			);
		}
		return <FileTreeFile key={node.path} name={node.name} path={node.path} />;
	});
}

function findNode(
	nodes: FileTreeNode[],
	path: string,
): FileTreeNode | undefined {
	for (const node of nodes) {
		if (node.path === path) return node;
		if (node.children) {
			const found = findNode(node.children, path);
			if (found) return found;
		}
	}
	return undefined;
}

export function AgentDetailPage() {
	const { name } = useParams<{ name: string }>();
	const [selectedPath, setSelectedPath] = useState<string>();
	const handleSelect = useCallback((path: string) => setSelectedPath(path), []);

	const { data: tree = [] } = useAgentFiles(name);

	const isDirectory =
		!!selectedPath && findNode(tree, selectedPath)?.type === "directory";

	const { data: file, isPending: fileLoading } = useAgentFile(
		name,
		selectedPath,
		isDirectory,
	);

	return (
		<div className="flex h-full flex-col">
			{/* Breadcrumb */}
			<div className="border-b px-4 py-2">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/agents">Agents</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>{name}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>

			{/* Two-panel layout */}
			<div className="flex flex-1 min-h-0">
				{/* File tree */}
				<ScrollArea className="w-72 border-r">
					<div className="p-3">
						{tree.length > 0 ? (
							<FileTree
								{...({ onSelect: handleSelect } as Record<string, unknown>)}
								selectedPath={selectedPath}
								className="border-0"
							>
								{<TreeNodes nodes={tree} />}
							</FileTree>
						) : (
							<p className="text-sm text-muted-foreground p-2">
								No files found
							</p>
						)}
					</div>
				</ScrollArea>

				{/* File content */}
				<div className="flex-1 min-w-0">
					{fileLoading ? (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							Loading...
						</div>
					) : file ? (
						<CodeBlock
							code={file.content}
							language="markdown"
							// language={file.language as BundledLanguage}
							showLineNumbers
							className="h-full rounded-none border-0 flex flex-col [&>.relative]:flex-1 [&>.relative]:min-h-0"
						>
							<CodeBlockHeader>
								<CodeBlockTitle>
									<CodeBlockFilename>{file.filename}</CodeBlockFilename>
								</CodeBlockTitle>
								<CodeBlockActions>
									<CodeBlockCopyButton />
								</CodeBlockActions>
							</CodeBlockHeader>
						</CodeBlock>
					) : (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							Select a file to view its contents
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
