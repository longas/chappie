import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { FileUIPart } from "ai";
import { Bell, Star } from "lucide-react";
import { useCallback, useState } from "react";
import { Streamdown } from "streamdown";
import {
	Attachment,
	AttachmentInfo,
	AttachmentPreview,
	AttachmentRemove,
	Attachments,
} from "@/components/ai-elements/attachments";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputBody,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
} from "@/components/ai-elements/tool";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
	type FileAttachment,
	type HumanRequest,
	type MessagePart,
	type Message as StoreMessage,
	useAppStore,
} from "./store";

function MessageWithParts({ message }: { message: StoreMessage }) {
	const isUser = message.from === "user";
	const fileParts = message.parts.filter((p) => p.type === "file");
	const otherParts = message.parts.filter((p) => p.type !== "file");

	return (
		<Message from={isUser ? "user" : "assistant"}>
			<div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
				<Avatar className="h-8 w-8 shrink-0">
					<AvatarFallback
						className={cn(
							"text-xs",
							isUser
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-secondary-foreground",
						)}
					>
						{isUser ? "You" : message.from.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div
					className={cn(
						"flex max-w-[80%] flex-col gap-1",
						isUser && "items-end",
					)}
				>
					<span className="text-xs text-muted-foreground">
						{isUser ? "You" : message.from}
					</span>
					{fileParts.length > 0 && (
						<Attachments className="mb-2" variant="grid">
							{fileParts.map((part, i) => (
								<Attachment
									key={`${message.id}-file-${i}`}
									data={{
										id: `${message.id}-file-${i}`,
										type: "file",
										url: part.url,
										filename: part.filename,
										mediaType: part.mediaType,
									}}
								>
									<AttachmentPreview />
								</Attachment>
							))}
						</Attachments>
					)}
					<MessageContent>
						{otherParts.map((part, i) => (
							<MessagePartRenderer
								key={`${message.id}-part-${i}`}
								part={part}
								isStreaming={message.isStreaming && i === otherParts.length - 1}
							/>
						))}
						{message.isStreaming && message.parts.length === 0 && (
							<div className="flex items-center gap-2 text-muted-foreground text-sm">
								<Shimmer>Thinking...</Shimmer>
							</div>
						)}
					</MessageContent>
				</div>
			</div>
		</Message>
	);
}

function MessagePartRenderer({
	part,
	isStreaming,
}: {
	part: MessagePart;
	isStreaming: boolean;
}) {
	if (part.type === "reasoning") {
		return (
			<Reasoning isStreaming={isStreaming} defaultOpen={false}>
				<ReasoningTrigger />
				<ReasoningContent>{part.text}</ReasoningContent>
			</Reasoning>
		);
	}

	if (part.type === "text") {
		return <MessageResponse>{part.text}</MessageResponse>;
	}

	// File parts are rendered separately via Attachments in MessageWithParts
	if (part.type === "file") return null;

	// Tool use - type starts with "tool-"
	if (part.type.startsWith("tool-")) {
		const toolState =
			part.state === "running"
				? "input-available"
				: part.state === "error"
					? "output-error"
					: "output-available";
		return (
			<Tool>
				<ToolHeader
					type="dynamic-tool"
					state={toolState}
					toolName={part.toolName}
				/>
				<ToolContent>
					<ToolInput input={part.input} />
				</ToolContent>
			</Tool>
		);
	}

	return null;
}

async function uploadFiles(files: FileUIPart[]): Promise<FileAttachment[]> {
	const formData = new FormData();
	for (const file of files) {
		// Convert data URL to blob for upload
		const response = await fetch(file.url);
		const blob = await response.blob();
		formData.append("file", blob, file.filename);
	}
	const res = await fetch("/upload", { method: "POST", body: formData });
	return res.json();
}

function InputAttachmentsDisplay() {
	const { files, remove } = usePromptInputAttachments();
	if (files.length === 0) return null;

	return (
		<PromptInputHeader>
			<Attachments variant="inline">
				{files.map((file) => (
					<Attachment
						key={file.id}
						data={file}
						onRemove={() => remove(file.id)}
					>
						<AttachmentPreview />
						<AttachmentInfo />
						<AttachmentRemove />
					</Attachment>
				))}
			</Attachments>
		</PromptInputHeader>
	);
}

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
		// Pending first
		if (a.status === "pending" && b.status !== "pending") return -1;
		if (a.status !== "pending" && b.status === "pending") return 1;
		// Then by createdAt desc
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

export function App() {
	const conversations = useAppStore((s) => s.conversations);
	const selectedId = useAppStore((s) => s.selectedId);
	const agents = useAppStore((s) => s.agents);
	const connected = useAppStore((s) => s.connected);
	const selectConversation = useAppStore((s) => s.selectConversation);
	const sendMessageWithAttachments = useAppStore(
		(s) => s.sendMessageWithAttachments,
	);
	const humanRequests = useAppStore((s) => s.humanRequests);
	const [requestsPanelOpen, setRequestsPanelOpen] = useState(false);

	const selectedConversation = conversations.get(selectedId);
	const isHumanConversation = selectedConversation?.isHuman ?? false;
	const pendingRequestCount = Array.from(humanRequests.values()).filter(
		(r) => r.status === "pending",
	).length;

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const { text, files } = message;

			// Upload files to server
			let attachments: FileAttachment[] = [];
			if (files.length > 0) {
				attachments = await uploadFiles(files);
			}

			sendMessageWithAttachments(text, attachments);
		},
		[sendMessageWithAttachments],
	);

	const conversationList = Array.from(conversations.values()).sort((a, b) => {
		if (a.isHuman) return -1;
		if (b.isHuman) return 1;
		return 0;
	});

	return (
		<TooltipProvider>
			<div className="flex h-screen bg-background">
				{/* Sidebar */}
				<div className="w-64 border-r flex flex-col">
					<div className="h-14 px-4 border-b font-semibold flex items-center">
						Conversations
					</div>
					<ScrollArea className="flex-1">
						<div className="p-2 flex flex-col gap-1">
							{conversationList.map((convo) => (
								<Button
									key={convo.id}
									variant={selectedId === convo.id ? "secondary" : "ghost"}
									className={cn(
										"w-full justify-start gap-2 h-auto py-2 px-3",
										convo.hasUnread && "font-semibold",
									)}
									onClick={() => selectConversation(convo.id)}
								>
									{convo.isHuman && (
										<Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
									)}
									<span className="truncate">
										{convo.participants[0] === "user"
											? "You"
											: convo.participants[0]}
										{" ↔ "}
										{convo.participants[1] === "user"
											? "You"
											: convo.participants[1]}
									</span>
									{convo.hasUnread && (
										<span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" />
									)}
								</Button>
							))}
						</div>
					</ScrollArea>
				</div>

				{/* Main Chat Area */}
				<div className="flex-1 flex flex-col">
					{/* Header */}
					<div className="h-14 px-4 flex items-center justify-between border-b">
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
						<div className="flex items-center gap-3">
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
							{agents.map((agent) => (
								<Tooltip key={agent.name}>
									<TooltipTrigger asChild>
										<div className="flex items-center gap-1.5 cursor-default">
											<span
												className={cn(
													"h-2 w-2 rounded-full",
													agent.status === "working"
														? "bg-green-500 animate-pulse"
														: "bg-muted-foreground/30",
												)}
											/>
											<span className="text-xs text-muted-foreground">
												{agent.name}
											</span>
										</div>
									</TooltipTrigger>
									<TooltipContent>
										{agent.status === "working" ? "Working" : "Idle"}
									</TooltipContent>
								</Tooltip>
							))}
						</div>
					</div>

					{/* Messages */}
					<Conversation className="flex-1">
						<ConversationContent>
							{(!selectedConversation ||
								selectedConversation.messages.length === 0) && (
								<ConversationEmptyState
									title={
										isHumanConversation
											? "Start a conversation"
											: "No messages yet"
									}
									description={
										isHumanConversation
											? "Send a message to start chatting with the agent"
											: "Messages between agents will appear here"
									}
								/>
							)}
							{selectedConversation?.messages.map((msg) => (
								<MessageWithParts key={msg.id} message={msg} />
							))}
						</ConversationContent>
						<ConversationScrollButton />
					</Conversation>

					{/* Input - only for human conversation */}
					{isHumanConversation && (
						<div className="border-t p-4">
							<PromptInput
								multiple
								maxFileSize={10 * 1024 * 1024}
								onSubmit={handleSubmit}
							>
								<InputAttachmentsDisplay />
								<PromptInputBody>
									<PromptInputTextarea
										placeholder="Type a message..."
										disabled={!connected}
									/>
								</PromptInputBody>
								<PromptInputFooter>
									<PromptInputTools>
										<PromptInputActionMenu>
											<PromptInputActionMenuTrigger />
											<PromptInputActionMenuContent>
												<PromptInputActionAddAttachments label="Add images or files" />
											</PromptInputActionMenuContent>
										</PromptInputActionMenu>
									</PromptInputTools>
									<PromptInputSubmit disabled={!connected} />
								</PromptInputFooter>
							</PromptInput>
						</div>
					)}
				</div>
			</div>
			<HumanRequestsPanel
				open={requestsPanelOpen}
				onOpenChange={setRequestsPanelOpen}
			/>
		</TooltipProvider>
	);
}
