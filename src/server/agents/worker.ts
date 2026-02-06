import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
	HookCallback,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk/sdk";
import { UPLOADS_DIR } from "../constants.ts";
import { CronManager } from "./cron-manager.ts";
import type { FileAttachment, WorkerOutMessage } from "./orchestrator.ts";
import { WorkerInMessage } from "./orchestrator.ts";
import { createEmailServer } from "./tools/email.ts";
import { createHumanRequestServer } from "./tools/human-request.ts";
import { createSchedulerServer } from "./tools/scheduler.ts";
import { createTeamChatServer } from "./tools/team-chat.ts";
import {
	W_DONE,
	W_INIT,
	W_PROCESS,
	W_RESOLVE_HUMAN_REQUEST,
	W_THINKING,
	W_TOOL_RESULT,
	W_TOOL_USE,
	W_TURN_START,
} from "./worker-events.ts";

declare const self: Worker;

async function buildAttachmentBlocks(attachments: FileAttachment[]): Promise<
	Array<
		| { type: "text"; text: string }
		| {
				type: "image";
				source: { type: "base64"; media_type: string; data: string };
		  }
	>
> {
	const blocks: Array<
		| { type: "text"; text: string }
		| {
				type: "image";
				source: { type: "base64"; media_type: string; data: string };
		  }
	> = [];

	for (const att of attachments) {
		const diskFilename = att.url.split("/").pop();
		if (!diskFilename) continue;

		const filePath = `${UPLOADS_DIR}/${diskFilename}`;
		const file = Bun.file(filePath);
		if (!(await file.exists())) continue;

		if (att.mediaType.startsWith("image/")) {
			const buffer = await file.arrayBuffer();
			const base64 = Buffer.from(buffer).toString("base64");
			blocks.push({
				type: "image",
				source: {
					type: "base64",
					media_type: att.mediaType,
					data: base64,
				},
			});
		} else {
			blocks.push({
				type: "text",
				text: `[Attached file: ${att.filename} (${att.mediaType})]`,
			});
		}
	}

	return blocks;
}

async function buildPrompt(message: {
	from: string;
	content: string;
	attachments?: FileAttachment[];
}): Promise<string | AsyncIterable<SDKUserMessage>> {
	if (!message.attachments?.length) {
		return `Message from ${message.from}: ${message.content}`;
	}

	const fileBlocks = await buildAttachmentBlocks(message.attachments);
	const content = [
		{
			type: "text" as const,
			text: `Message from ${message.from}: ${message.content}`,
		},
		...fileBlocks,
	];

	async function* generate(): AsyncGenerator<SDKUserMessage> {
		yield {
			type: "user",
			session_id: "",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content,
			},
		};
	}

	return generate();
}

let config: {
	agentName: string;
	workspace: string;
	validAgents: string[];
};
let sessionId: string | undefined;
let cronManager: CronManager;
let mcpServers: Record<string, ReturnType<typeof createTeamChatServer>>;
let humanRequest: ReturnType<typeof createHumanRequestServer>;

self.onmessage = async (event: MessageEvent) => {
	const msg = WorkerInMessage.parse(event.data);

	if (msg.type === W_INIT) {
		config = msg.config;

		const teamChat = createTeamChatServer(config.agentName, (sendMsg) =>
			self.postMessage(sendMsg),
		);

		cronManager = new CronManager(config.agentName, (cronMsg) =>
			self.postMessage(cronMsg),
		);

		const scheduler = createSchedulerServer(cronManager);

		const email = createEmailServer();

		humanRequest = createHumanRequestServer(config.agentName, (reqMsg) =>
			self.postMessage(reqMsg),
		);

		mcpServers = {
			"team-chat": teamChat,
			scheduler,
			email,
			"human-request": humanRequest.server,
		};

		return;
	}

	if (msg.type === W_RESOLVE_HUMAN_REQUEST) {
		humanRequest.resolveRequest(msg.requestId, msg.response, msg.dismissed);
		return;
	}

	if (msg.type === W_PROCESS) {
		const { message } = msg;
		const turnId = crypto.randomUUID();

		// Signal that this turn has started
		const startMsg: WorkerOutMessage = {
			type: W_TURN_START,
			turnId,
		};
		self.postMessage(startMsg);

		let resultText = "";

		// Build prompt: string for plain text, async generator for attachments
		const prompt = await buildPrompt(message);

		const onStop: HookCallback = async (input) => {
			try {
				const transcript = await Bun.file(input.transcript_path).text();
				let summary = "";

				for await (const m of query({
					prompt: `Summarize this conversation in 2-3 sentences:\n\n${transcript}`,
					options: {
						model: "claude-sonnet-4-5-20250929",
						permissionMode: "bypassPermissions",
					},
				})) {
					if (m.type === "result" && m.subtype === "success") {
						summary = m.result;
					}
				}

				console.log(`[${config.agentName}] Summary: ${summary}`);
			} catch (err) {
				console.error(`[${config.agentName}] Summary failed:`, err);
			}
			return {};
		};

		for await (const m of query({
			prompt,
			options: {
				model: "claude-opus-4-6",
				// Any non-zero value enables adaptive thinking for Opus 4.6
				maxThinkingTokens: 1,
				resume: sessionId,
				permissionMode: "bypassPermissions",
				cwd: config.workspace,
				settingSources: ["project"],
				mcpServers,
				// hooks: {
				// 	Stop: [{ hooks: [onStop] }],
				// },
			},
		})) {
			if (m.type === "system" && m.subtype === "init") {
				sessionId = m.session_id;
			} else if (m.type === "result") {
				resultText = m.subtype === "success" ? m.result : m.errors.join("\n");
			} else if (m.type === "assistant") {
				// Extract thinking traces and tool uses from the assistant message
				for (const content of m.message.content) {
					if (content.type === "thinking") {
						const outMsg: WorkerOutMessage = {
							type: W_THINKING,
							turnId,
							thinking: content.thinking,
						};
						self.postMessage(outMsg);
					}
					if (content.type === "tool_use") {
						const outMsg: WorkerOutMessage = {
							type: W_TOOL_USE,
							turnId,
							toolUseId: content.id,
							toolName: content.name,
							input: content.input,
						};
						self.postMessage(outMsg);
					}
				}
			} else if (m.type === "user") {
				// Extract tool results from user messages
				for (const content of m.message.content) {
					if (content.type === "tool_result") {
						const outMsg: WorkerOutMessage = {
							type: W_TOOL_RESULT,
							turnId,
							toolUseId: content.tool_use_id,
							isError: content.is_error ?? false,
						};
						self.postMessage(outMsg);
					}
				}
			}
		}

		const doneMsg: WorkerOutMessage = {
			type: W_DONE,
			turnId,
			visibleText: resultText,
		};
		self.postMessage(doneMsg);
	}
};
