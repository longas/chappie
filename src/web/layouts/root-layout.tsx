import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Bell, Bot, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "../hooks/use-theme";
import { type HumanRequest, useAppStore } from "../store";

function timeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function HumanRequestCard({ request }: { request: HumanRequest }) {
	const [response, setResponse] = useState("");
	const resolveHumanRequest = useAppStore((s) => s.resolveHumanRequest);
	const dismissHumanRequest = useAppStore((s) => s.dismissHumanRequest);

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">
						{request.agentName}
					</span>
					<span className="text-xs text-muted-foreground">
						{timeAgo(request.createdAt)}
					</span>
				</div>
				<CardTitle className="text-sm">{request.title}</CardTitle>
				<Streamdown
					className="text-sm text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
					plugins={{ cjk, code, math, mermaid }}
				>
					{request.description}
				</Streamdown>
			</CardHeader>
			<CardContent>
				{request.status === "pending" ? (
					<div className="flex flex-col gap-2">
						<Textarea
							placeholder="Type your response..."
							value={response}
							onChange={(e) => setResponse(e.target.value)}
							rows={2}
						/>
						<div className="flex gap-2 justify-end">
							<Button
								variant="outline"
								size="sm"
								onClick={() => dismissHumanRequest(request.id)}
							>
								Dismiss
							</Button>
							<Button
								size="sm"
								onClick={() => {
									if (response.trim()) {
										resolveHumanRequest(request.id, response.trim());
										setResponse("");
									}
								}}
								disabled={!response.trim()}
							>
								Respond
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<Badge
							variant={request.status === "resolved" ? "secondary" : "outline"}
						>
							{request.status}
						</Badge>
						{request.response && (
							<span className="text-sm text-muted-foreground truncate">
								{request.response}
							</span>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function HumanRequestsPanel({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const humanRequests = useAppStore((s) => s.humanRequests);

	const sorted = Array.from(humanRequests.values()).sort((a, b) => {
		if (a.status === "pending" && b.status !== "pending") return -1;
		if (a.status !== "pending" && b.status === "pending") return 1;
		return b.createdAt - a.createdAt;
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
				<SheetHeader>
					<SheetTitle>Human Requests</SheetTitle>
					<SheetDescription>
						Requests from agents that need your attention
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="flex-1 px-4 pb-4">
					{sorted.length === 0 ? (
						<p className="text-sm text-muted-foreground text-center py-8">
							No requests yet
						</p>
					) : (
						<div className="flex flex-col gap-3">
							{sorted.map((req) => (
								<HumanRequestCard key={req.id} request={req} />
							))}
						</div>
					)}
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
	cn(
		"text-sm font-medium transition-colors hover:text-foreground",
		isActive ? "text-foreground" : "text-muted-foreground",
	);

export function RootLayout() {
	const agents = useAppStore((s) => s.agents);
	const connected = useAppStore((s) => s.connected);
	const humanRequests = useAppStore((s) => s.humanRequests);
	const [requestsPanelOpen, setRequestsPanelOpen] = useState(false);
	const [agentsOpen, setAgentsOpen] = useState(false);
	const { theme, setTheme, resolved } = useTheme();

	const pendingRequestCount = Array.from(humanRequests.values()).filter(
		(r) => r.status === "pending",
	).length;

	return (
		<TooltipProvider>
			<div className="flex h-screen flex-col bg-background">
				{/* Header */}
				<div className="h-14 px-4 flex items-center justify-between border-b shrink-0">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<h1 className="text-xl font-semibold">🤖 Chappie</h1>
							<Tooltip>
								<TooltipTrigger asChild>
									<span
										className={cn(
											"h-2 w-2 rounded-full cursor-default",
											connected ? "bg-green-500" : "bg-red-500",
										)}
									/>
								</TooltipTrigger>
								<TooltipContent>
									{connected
										? "Connected to WebSocket"
										: "Disconnected from WebSocket"}
								</TooltipContent>
							</Tooltip>
						</div>
						<nav className="flex items-center gap-3">
							<NavLink to="/" className={navLinkClass} end>
								Chat
							</NavLink>
							<NavLink to="/agents" className={navLinkClass}>
								Agents
							</NavLink>
						</nav>
					</div>
					<div className="flex items-center gap-3">
						{agentsOpen &&
							agents.map((agent, i) => (
								<div
									key={agent.name}
									className="animate-in fade-in slide-in-from-right-2 duration-200 fill-mode-backwards flex items-center gap-1.5"
									style={{ animationDelay: `${i * 50}ms` }}
								>
									<span
										className={cn(
											"h-2 w-2 shrink-0 rounded-full",
											agent.status === "working"
												? "bg-green-500 animate-pulse"
												: "bg-muted-foreground/30",
										)}
									/>
									<span className="text-xs text-muted-foreground">
										{agent.name}
									</span>
								</div>
							))}
						<Button
							variant="ghost"
							size="icon"
							className="relative h-8 w-8"
							onClick={() => setAgentsOpen((o) => !o)}
						>
							<Bot className="h-4 w-4" />
							{!agentsOpen && agents.some((a) => a.status === "working") && (
								<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
							)}
							<span className="sr-only">Agents</span>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="relative h-8 w-8"
							onClick={() => setRequestsPanelOpen(true)}
						>
							<Bell className="h-4 w-4" />
							{pendingRequestCount > 0 && (
								<span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
									{pendingRequestCount}
								</span>
							)}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" className="h-8 w-8">
									{resolved === "dark" ? (
										<Moon className="h-4 w-4" />
									) : (
										<Sun className="h-4 w-4" />
									)}
									<span className="sr-only">Toggle theme</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuRadioGroup
									value={theme}
									onValueChange={(v) =>
										setTheme(v as "light" | "dark" | "system")
									}
								>
									<DropdownMenuRadioItem value="light">
										<Sun className="mr-2 h-4 w-4" />
										Light
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="dark">
										<Moon className="mr-2 h-4 w-4" />
										Dark
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="system">
										<Monitor className="mr-2 h-4 w-4" />
										System
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				{/* Page content */}
				<div className="flex-1 min-h-0">
					<Outlet />
				</div>
			</div>
			<HumanRequestsPanel
				open={requestsPanelOpen}
				onOpenChange={setRequestsPanelOpen}
			/>
		</TooltipProvider>
	);
}
