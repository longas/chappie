import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useAgents } from "@/hooks/use-agents";
import { cn } from "@/lib/utils";

export function AgentsPage() {
	const { data: agents = [], isPending, error } = useAgents();

	if (isPending) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
				Loading agents...
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-destructive text-sm">
				Failed to load agents: {error.message}
			</div>
		);
	}

	return (
		<div className="p-6">
			<div className="mb-6">
				<h2 className="text-2xl font-semibold">Agents</h2>
				<p className="text-muted-foreground text-sm">
					Browse agent workspaces and files
				</p>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{agents.map((agent) => (
					<Link key={agent.name} to={`/agents/${agent.name}`}>
						<Card className="transition-colors hover:bg-muted/50">
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="text-base">{agent.name}</CardTitle>
									<Badge
										variant={
											agent.status === "working" ? "default" : "secondary"
										}
										className={cn(
											agent.status === "working" && "animate-pulse",
										)}
									>
										{agent.status}
									</Badge>
								</div>
								<CardDescription className="line-clamp-3">
									{agent.description}
								</CardDescription>
							</CardHeader>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
