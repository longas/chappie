import type { FileUIPart } from "ai";
import { Star } from "lucide-react";
import { useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
	type FileAttachment,
	type MessagePart,
	type Message as StoreMessage,
	useAppStore,
} from "../store";

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

	if (part.type === "file") return null;

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
		const response = await fetch(file.url);
		const blob = await response.blob();
		formData.append("file", blob, file.filename);
	}
	const res = await fetch("/api/upload", { method: "POST", body: formData });
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

export function ChatPage() {
	const conversations = useAppStore((s) => s.conversations);
	const selectedId = useAppStore((s) => s.selectedId);
	const connected = useAppStore((s) => s.connected);
	const selectConversation = useAppStore((s) => s.selectConversation);
	const sendMessageWithAttachments = useAppStore(
		(s) => s.sendMessageWithAttachments,
	);

	const selectedConversation = conversations.get(selectedId);
	const isHumanConversation = selectedConversation?.isHuman ?? false;

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const { text, files } = message;
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
		<div className="flex h-full">
			{/* Sidebar */}
			<div className="w-64 border-r flex flex-col">
				<div className="h-10 px-4 border-b font-semibold flex items-center text-sm">
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
									{" \u2194 "}
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
	);
}
