import { z } from "zod";
import {
	W_CRON_FIRE,
	W_DONE,
	W_HUMAN_REQUEST,
	W_INIT,
	W_PROCESS,
	W_RESOLVE_HUMAN_REQUEST,
	W_SEND,
	W_THINKING,
	W_TOOL_RESULT,
	W_TOOL_USE,
	W_TURN_START,
} from "./worker-events.ts";
import { createWorkspaces } from "./workspace";

// --- Message schemas: Main thread → Worker ---

const InitMessage = z.object({
	type: z.literal(W_INIT),
	config: z.object({
		agentName: z.string(),
		workspace: z.string(),
		validAgents: z.array(z.string()),
	}),
});

const FileAttachmentSchema = z.object({
	id: z.string(),
	filename: z.string(),
	mediaType: z.string(),
	url: z.string(),
});

const ProcessMessage = z.object({
	type: z.literal(W_PROCESS),
	message: z.object({
		from: z.string(),
		content: z.string(),
		attachments: z.array(FileAttachmentSchema).optional(),
	}),
});

const ResolveHumanRequestMessage = z.object({
	type: z.literal(W_RESOLVE_HUMAN_REQUEST),
	requestId: z.string(),
	response: z.string(),
	dismissed: z.boolean(),
});

export const WorkerInMessage = z.discriminatedUnion("type", [
	InitMessage,
	ProcessMessage,
	ResolveHumanRequestMessage,
]);

export type WorkerInMessage = z.infer<typeof WorkerInMessage>;

// --- Message schemas: Worker → Main thread ---

const SendMessage = z.object({
	type: z.literal(W_SEND),
	to: z.string(),
	message: z.string(),
});

const TurnStartMessage = z.object({
	type: z.literal(W_TURN_START),
	turnId: z.string(),
});

const DoneMessage = z.object({
	type: z.literal(W_DONE),
	turnId: z.string(),
	visibleText: z.string(),
});

const ThinkingMessage = z.object({
	type: z.literal(W_THINKING),
	turnId: z.string(),
	thinking: z.string(),
});

const ToolUseMessage = z.object({
	type: z.literal(W_TOOL_USE),
	turnId: z.string(),
	toolUseId: z.string(),
	toolName: z.string(),
	input: z.unknown(),
});

const ToolResultMessage = z.object({
	type: z.literal(W_TOOL_RESULT),
	turnId: z.string(),
	toolUseId: z.string(),
	isError: z.boolean(),
});

const CronFireMessage = z.object({
	type: z.literal(W_CRON_FIRE),
	jobId: z.string(),
	jobName: z.string(),
	message: z.string(),
});

const HumanRequestMessage = z.object({
	type: z.literal(W_HUMAN_REQUEST),
	requestId: z.string(),
	agentName: z.string(),
	title: z.string(),
	description: z.string(),
});

export const WorkerOutMessage = z.discriminatedUnion("type", [
	SendMessage,
	TurnStartMessage,
	DoneMessage,
	ThinkingMessage,
	ToolUseMessage,
	ToolResultMessage,
	CronFireMessage,
	HumanRequestMessage,
]);

export type WorkerOutMessage = z.infer<typeof WorkerOutMessage>;

// --- Types ---

export type FileAttachment = {
	id: string;
	filename: string;
	mediaType: string;
	url: string;
};

type LaneMessage = {
	from: string;
	content: string;
	attachments?: FileAttachment[];
};

export type AgentStatus = "idle" | "working";

export type StoredMessage = {
	id: string;
	from: string;
	text: string;
	timestamp: number;
	attachments?: FileAttachment[];
};

export type StoredConversation = {
	id: string;
	participants: [string, string];
	isHuman: boolean;
	messages: StoredMessage[];
};

export type HumanRequestRecord = {
	id: string;
	agentName: string;
	title: string;
	description: string;
	status: "pending" | "resolved" | "dismissed";
	response?: string;
	createdAt: number;
	resolvedAt?: number;
};

export type OrchestratorConfig = {
	registryPath: string;
	workspacesPath: string;
	entryAgent: string;
	onAgentResponse: (agent: string, turnId: string, text: string) => void;
	onAgentStatusChange: (agent: string, status: AgentStatus) => void;
	onInterAgentMessage: (from: string, to: string, message: string) => void;
	onTurnStart: (agent: string, turnId: string) => void;
	onThinking: (agent: string, turnId: string, thinking: string) => void;
	onToolUse: (
		agent: string,
		turnId: string,
		toolUseId: string,
		toolName: string,
		input: unknown,
	) => void;
	onToolResult: (
		agent: string,
		turnId: string,
		toolUseId: string,
		isError: boolean,
	) => void;
	onHumanRequest: (request: HumanRequestRecord) => void;
};

// --- AgentsOrchestrator ---

export class AgentsOrchestrator {
	private config: OrchestratorConfig;
	private workers = new Map<string, Worker>();
	private queues = new Map<string, LaneMessage[]>();
	private active = new Set<string>();
	private conversations = new Map<string, StoredConversation>();
	private humanRequests = new Map<string, HumanRequestRecord>();
	private agentDescriptions = new Map<string, string>();

	constructor(config: OrchestratorConfig) {
		this.config = config;
	}

	// Sort so (A, B) and (B, A) always resolve to the same conversation.
	private getConversationId(a: string, b: string): string {
		return [a, b].sort().join("-");
	}

	private storeMessage(
		from: string,
		to: string,
		text: string,
		isHuman: boolean,
		attachments?: FileAttachment[],
	): void {
		const convoId = this.getConversationId(from, to);
		const message: StoredMessage = {
			id: crypto.randomUUID(),
			from,
			text,
			timestamp: Date.now(),
			...(attachments?.length ? { attachments } : {}),
		};

		const existing = this.conversations.get(convoId);
		if (existing) {
			existing.messages.push(message);
		} else {
			const participants: [string, string] = [from, to].sort() as [
				string,
				string,
			];
			this.conversations.set(convoId, {
				id: convoId,
				participants,
				isHuman,
				messages: [message],
			});
		}
	}

	getConversations(): StoredConversation[] {
		return Array.from(this.conversations.values());
	}

	getHumanRequests(): HumanRequestRecord[] {
		return Array.from(this.humanRequests.values());
	}

	resolveHumanRequest(
		requestId: string,
		response: string,
		dismissed: boolean,
	): void {
		const record = this.humanRequests.get(requestId);
		if (!record || record.status !== "pending") return;

		record.status = dismissed ? "dismissed" : "resolved";
		record.response = response;
		record.resolvedAt = Date.now();

		// Send resolve message to the worker
		const worker = this.workers.get(record.agentName);
		if (worker) {
			worker.postMessage({
				type: "resolve_human_request",
				requestId,
				response,
				dismissed,
			} satisfies WorkerInMessage);

			// Deliver the response as a message to the agent
			if (!dismissed) {
				this.dispatch(record.agentName, {
					from: "human",
					content: `[Response to your request "${record.title}"] ${response}`,
				});
			}
		}
	}

	async init(): Promise<void> {
		const { agentNames, agentRegistry } = await createWorkspaces(
			this.config.registryPath,
			this.config.workspacesPath,
		);

		for (const [name, description] of Object.entries(agentRegistry)) {
			this.agentDescriptions.set(name, description);
		}

		for (const agentName of agentNames) {
			const workspace = `${this.config.workspacesPath}/${agentName}`;
			const otherAgents = agentNames.filter((n) => n !== agentName);

			const worker = new Worker(new URL("./worker.ts", import.meta.url).href);
			this.workers.set(agentName, worker);
			this.queues.set(agentName, []);
			console.log(`[${agentName}] spawned`);

			worker.onmessage = (event: MessageEvent) => {
				const msg = WorkerOutMessage.parse(event.data);

				if (msg.type === W_SEND) {
					console.log(`[${agentName}] -> [${msg.to}]`);
					this.storeMessage(agentName, msg.to, msg.message, false);
					this.config.onInterAgentMessage(agentName, msg.to, msg.message);
					this.dispatch(msg.to, { from: agentName, content: msg.message });
				}

				if (msg.type === W_TURN_START) {
					this.config.onTurnStart(agentName, msg.turnId);
				}

				if (msg.type === W_DONE) {
					this.active.delete(agentName);
					this.config.onAgentStatusChange(agentName, "idle");
					this.processNextAgentMessage(agentName);

					// Only the entry agent can respond directly to the user
					if (msg.visibleText && agentName === this.config.entryAgent) {
						this.storeMessage(agentName, "user", msg.visibleText, true);
						this.config.onAgentResponse(agentName, msg.turnId, msg.visibleText);
					}
				}

				if (msg.type === W_THINKING) {
					this.config.onThinking(agentName, msg.turnId, msg.thinking);
				}

				if (msg.type === W_TOOL_USE) {
					this.config.onToolUse(
						agentName,
						msg.turnId,
						msg.toolUseId,
						msg.toolName,
						msg.input,
					);
				}

				if (msg.type === W_TOOL_RESULT) {
					this.config.onToolResult(
						agentName,
						msg.turnId,
						msg.toolUseId,
						msg.isError,
					);
				}

				if (msg.type === W_CRON_FIRE) {
					this.dispatch(agentName, {
						from: "scheduler",
						content: `[Scheduled job "${msg.jobName}" fired] ${msg.message}`,
					});
				}

				if (msg.type === W_HUMAN_REQUEST) {
					const record: HumanRequestRecord = {
						id: msg.requestId,
						agentName: msg.agentName,
						title: msg.title,
						description: msg.description,
						status: "pending",
						createdAt: Date.now(),
					};
					this.humanRequests.set(msg.requestId, record);
					this.config.onHumanRequest(record);
				}
			};

			// Send init message
			worker.postMessage({
				type: "init",
				config: {
					agentName,
					workspace,
					validAgents: otherAgents,
				},
			} satisfies WorkerInMessage);
		}
	}

	send(userMessage: string, attachments?: FileAttachment[]): void {
		this.storeMessage(
			"user",
			this.config.entryAgent,
			userMessage,
			true,
			attachments,
		);
		this.dispatch(this.config.entryAgent, {
			from: "user",
			content: userMessage,
			attachments,
		});
	}

	getAgents(): Array<{ name: string; status: AgentStatus }> {
		return Array.from(this.workers.keys()).map((name) => ({
			name,
			status: this.active.has(name) ? "working" : "idle",
		}));
	}

	getAgentDescriptions(): Array<{
		name: string;
		description: string;
		status: AgentStatus;
	}> {
		return Array.from(this.workers.keys()).map((name) => ({
			name,
			description: this.agentDescriptions.get(name) ?? "",
			status: this.active.has(name) ? "working" : "idle",
		}));
	}

	shutdown(): void {
		for (const worker of this.workers.values()) {
			worker.terminate();
		}
	}

	private dispatch(agentName: string, message: LaneMessage): void {
		const queue = this.queues.get(agentName);
		if (!queue) return;
		queue.push(message);
		this.processNextAgentMessage(agentName);
	}

	private processNextAgentMessage(agentName: string): void {
		if (this.active.has(agentName)) return;
		const queue = this.queues.get(agentName);
		if (!queue || queue.length === 0) return;

		const msg = queue.shift();
		if (!msg) return;
		this.active.add(agentName);
		this.config.onAgentStatusChange(agentName, "working");
		const processMsg: WorkerInMessage = {
			type: "process",
			message: msg,
		};
		this.workers.get(agentName)?.postMessage(processMsg);
	}
}
