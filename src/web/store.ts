import { create } from "zustand";
import {
	WS_AGENTS,
	WS_HISTORY,
	WS_HUMAN_REQUEST,
	WS_HUMAN_REQUESTS,
	WS_INTER_AGENT,
	WS_RESOLVE_HUMAN_REQUEST,
	WS_RESPONSE,
	WS_SEND,
	WS_STATUS,
	WS_THINKING,
	WS_TOOL_RESULT,
	WS_TOOL_USE,
	WS_TURN_START,
} from "../server/ws-events.ts";

const ENTRY_AGENT = "ceo";
const isEntryAgent = (agent: string) => agent === ENTRY_AGENT;

type FileAttachment = {
	id: string;
	filename: string;
	mediaType: string;
	url: string;
};

type MessagePart =
	| { type: "text"; text: string }
	| { type: "file"; url: string; filename: string; mediaType: string }
	| { type: "reasoning"; text: string; timestamp: number }
	| {
			type: `tool-${string}`;
			toolName: string;
			toolUseId: string;
			input: unknown;
			state: "running" | "complete" | "error";
			timestamp: number;
	  };

type Message = {
	id: string;
	from: string;
	parts: MessagePart[];
	timestamp: number;
	isStreaming: boolean;
};

type Conversation = {
	id: string;
	participants: [string, string];
	isHuman: boolean;
	messages: Message[];
	hasUnread: boolean;
};

type Agent = {
	name: string;
	status: "idle" | "working";
};

type HumanRequest = {
	id: string;
	agentName: string;
	title: string;
	description: string;
	status: "pending" | "resolved" | "dismissed";
	response?: string;
	createdAt: number;
	resolvedAt?: number;
};

function getConversationId(a: string, b: string): string {
	return [a, b].sort().join("-");
}

type AppState = {
	conversations: Map<string, Conversation>;
	selectedId: string;
	agents: Agent[];
	input: string;
	connected: boolean;
	ws: WebSocket;
	pendingMessages: Map<string, string>; // turnId → messageId
	humanRequests: Map<string, HumanRequest>;
};

type AppActions = {
	setInput: (input: string) => void;
	selectConversation: (id: string) => void;
	sendMessage: () => void;
	sendMessageWithAttachments: (
		text: string,
		attachments: FileAttachment[],
	) => void;
	resolveHumanRequest: (requestId: string, response: string) => void;
	dismissHumanRequest: (requestId: string) => void;
};

function createWebSocket(
	set: (
		partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
	) => void,
) {
	const ws = new WebSocket(`ws://${window.location.host}/ws`);

	ws.onopen = () => set({ connected: true });
	ws.onclose = () => set({ connected: false });

	ws.onmessage = (event) => {
		const data = JSON.parse(event.data);

		if (data.type === WS_AGENTS) {
			set({ agents: data.agents });
		}

		if (data.type === WS_HISTORY) {
			const loaded = new Map<string, Conversation>();
			for (const convo of data.conversations) {
				// Convert old message format to new parts-based format
				const convertedMessages: Message[] = convo.messages.map(
					(msg: {
						id: string;
						from: string;
						text: string;
						timestamp: number;
						attachments?: FileAttachment[];
					}) => {
						const parts: MessagePart[] = [];
						if (msg.attachments?.length) {
							for (const att of msg.attachments) {
								parts.push({
									type: "file" as const,
									url: att.url,
									filename: att.filename,
									mediaType: att.mediaType,
								});
							}
						}
						parts.push({ type: "text" as const, text: msg.text });
						return {
							id: msg.id,
							from: msg.from,
							parts,
							timestamp: msg.timestamp,
							isStreaming: false,
						};
					},
				);
				loaded.set(convo.id, {
					...convo,
					messages: convertedMessages,
					hasUnread: false,
				});
			}
			const humanConvoId = getConversationId("user", ENTRY_AGENT);
			if (!loaded.has(humanConvoId)) {
				loaded.set(humanConvoId, {
					id: humanConvoId,
					participants: ["user", ENTRY_AGENT],
					isHuman: true,
					messages: [],
					hasUnread: false,
				});
			}
			set({ conversations: loaded });
		}

		if (data.type === WS_STATUS) {
			set((state) => ({
				agents: state.agents.map((a) =>
					a.name === data.agent ? { ...a, status: data.status } : a,
				),
			}));
		}

		// Turn started - create a pending message (only for entry agent)
		if (data.type === WS_TURN_START && isEntryAgent(data.agent)) {
			const humanConvoId = getConversationId("user", ENTRY_AGENT);
			const newMsgId = crypto.randomUUID();

			set((state) => {
				const updated = new Map(state.conversations);
				const existing = updated.get(humanConvoId);
				if (existing) {
					const newMessage: Message = {
						id: newMsgId,
						from: data.agent,
						parts: [],
						timestamp: Date.now(),
						isStreaming: true,
					};
					updated.set(humanConvoId, {
						...existing,
						messages: [...existing.messages, newMessage],
						hasUnread: humanConvoId !== state.selectedId,
					});
				}
				const pendingMessages = new Map(state.pendingMessages);
				pendingMessages.set(data.turnId, newMsgId);
				return { conversations: updated, pendingMessages };
			});
		}

		// Thinking - append reasoning part to pending message (only for entry agent)
		if (data.type === WS_THINKING && isEntryAgent(data.agent)) {
			const humanConvoId = getConversationId("user", ENTRY_AGENT);

			set((state) => {
				const msgId = state.pendingMessages.get(data.turnId);
				if (!msgId) return {};

				const updated = new Map(state.conversations);
				const existing = updated.get(humanConvoId);
				if (existing) {
					const messages = existing.messages.map((msg) => {
						if (msg.id === msgId) {
							return {
								...msg,
								parts: [
									...msg.parts,
									{
										type: "reasoning" as const,
										text: data.thinking,
										timestamp: Date.now(),
									},
								],
							};
						}
						return msg;
					});
					updated.set(humanConvoId, { ...existing, messages });
				}
				return { conversations: updated };
			});
		}

		// Tool use - append tool part to pending message (only for entry agent)
		if (data.type === WS_TOOL_USE && isEntryAgent(data.agent)) {
			const humanConvoId = getConversationId("user", ENTRY_AGENT);

			set((state) => {
				const msgId = state.pendingMessages.get(data.turnId);
				if (!msgId) return {};

				const updated = new Map(state.conversations);
				const existing = updated.get(humanConvoId);
				if (existing) {
					const messages = existing.messages.map((msg) => {
						if (msg.id === msgId) {
							return {
								...msg,
								parts: [
									...msg.parts,
									{
										type: `tool-${data.toolName}` as const,
										toolName: data.toolName,
										toolUseId: data.toolUseId,
										input: data.input,
										state: "running" as const,
										timestamp: Date.now(),
									},
								],
							};
						}
						return msg;
					});
					updated.set(humanConvoId, { ...existing, messages });
				}
				return { conversations: updated };
			});
		}

		// Tool result - update tool part state (only for entry agent)
		if (data.type === WS_TOOL_RESULT && isEntryAgent(data.agent)) {
			const humanConvoId = getConversationId("user", ENTRY_AGENT);

			set((state) => {
				const msgId = state.pendingMessages.get(data.turnId);
				if (!msgId) return {};

				const updated = new Map(state.conversations);
				const existing = updated.get(humanConvoId);
				if (existing) {
					const messages = existing.messages.map((msg) => {
						if (msg.id === msgId) {
							const updatedParts = msg.parts.map((part) => {
								if (
									part.type.startsWith("tool-") &&
									"toolUseId" in part &&
									part.toolUseId === data.toolUseId
								) {
									return {
										...part,
										state: data.isError
											? ("error" as const)
											: ("complete" as const),
									};
								}
								return part;
							});
							return { ...msg, parts: updatedParts };
						}
						return msg;
					});
					updated.set(humanConvoId, { ...existing, messages });
				}
				return { conversations: updated };
			});
		}

		// Response - append text part and finalize message
		if (data.type === WS_RESPONSE) {

			const humanConvoId = getConversationId("user", ENTRY_AGENT);

			set((state) => {
				const msgId = state.pendingMessages.get(data.turnId);
				if (!msgId) return {};

				const updated = new Map(state.conversations);
				const existing = updated.get(humanConvoId);
				if (existing) {
					const messages = existing.messages.map((msg) => {
						if (msg.id === msgId) {
							// Mark all tool uses as complete and add text part
							const updatedParts = msg.parts.map((part) => {
								if (part.type.startsWith("tool-")) {
									return { ...part, state: "complete" as const };
								}
								return part;
							});
							return {
								...msg,
								parts: [
									...updatedParts,
									{ type: "text" as const, text: data.text },
								],
								isStreaming: false,
							};
						}
						return msg;
					});
					updated.set(humanConvoId, {
						...existing,
						messages,
						hasUnread: humanConvoId !== state.selectedId,
					});
				}

				// Clean up pending message
				const pendingMessages = new Map(state.pendingMessages);
				pendingMessages.delete(data.turnId);

				return { conversations: updated, pendingMessages };
			});
		}

		if (data.type === WS_HUMAN_REQUESTS) {
			const loaded = new Map<string, HumanRequest>();
			for (const req of data.requests) {
				loaded.set(req.id, req);
			}
			set({ humanRequests: loaded });
		}

		if (data.type === WS_HUMAN_REQUEST) {
			set((state) => {
				const updated = new Map(state.humanRequests);
				updated.set(data.request.id, data.request);
				return { humanRequests: updated };
			});
		}

		if (data.type === WS_INTER_AGENT) {
			const convoId = getConversationId(data.from, data.to);
			set((state) => {
				const updated = new Map(state.conversations);
				const existing = updated.get(convoId);
				const newMessage: Message = {
					id: crypto.randomUUID(),
					from: data.from,
					parts: [{ type: "text" as const, text: data.message }],
					timestamp: Date.now(),
					isStreaming: false,
				};

				if (existing) {
					updated.set(convoId, {
						...existing,
						messages: [...existing.messages, newMessage],
						hasUnread: convoId !== state.selectedId,
					});
				} else {
					const participants: [string, string] = [
						data.from,
						data.to,
					].sort() as [string, string];
					updated.set(convoId, {
						id: convoId,
						participants,
						isHuman: false,
						messages: [newMessage],
						hasUnread: convoId !== state.selectedId,
					});
				}
				return { conversations: updated };
			});
		}
	};

	return ws;
}

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
	conversations: new Map(),
	selectedId: getConversationId("user", ENTRY_AGENT),
	agents: [],
	input: "",
	connected: false,
	ws: createWebSocket(set),
	pendingMessages: new Map(),
	humanRequests: new Map(),

	setInput: (input) => set({ input }),

	selectConversation: (id) =>
		set((state) => {
			const updated = new Map(state.conversations);
			const convo = updated.get(id);
			if (convo) {
				updated.set(id, { ...convo, hasUnread: false });
			}
			return { selectedId: id, conversations: updated };
		}),

	sendMessage: () => {
		const { input, ws } = get();
		if (!input.trim()) return;

		const humanConvoId = getConversationId("user", ENTRY_AGENT);
		set((state) => {
			const updated = new Map(state.conversations);
			const existing = updated.get(humanConvoId);
			if (existing) {
				const newMessage: Message = {
					id: crypto.randomUUID(),
					from: "user",
					parts: [{ type: "text" as const, text: input }],
					timestamp: Date.now(),
					isStreaming: false,
				};
				updated.set(humanConvoId, {
					...existing,
					messages: [...existing.messages, newMessage],
				});
			}
			return { conversations: updated, input: "" };
		});

		ws.send(JSON.stringify({ type: WS_SEND, message: input }));
	},

	sendMessageWithAttachments: (text, attachments) => {
		const { ws } = get();
		if (!text.trim() && attachments.length === 0) return;

		const humanConvoId = getConversationId("user", ENTRY_AGENT);
		set((state) => {
			const updated = new Map(state.conversations);
			const existing = updated.get(humanConvoId);
			if (existing) {
				const parts: MessagePart[] = [];
				for (const att of attachments) {
					parts.push({
						type: "file" as const,
						url: att.url,
						filename: att.filename,
						mediaType: att.mediaType,
					});
				}
				if (text.trim()) {
					parts.push({ type: "text" as const, text });
				}
				const newMessage: Message = {
					id: crypto.randomUUID(),
					from: "user",
					parts,
					timestamp: Date.now(),
					isStreaming: false,
				};
				updated.set(humanConvoId, {
					...existing,
					messages: [...existing.messages, newMessage],
				});
			}
			return { conversations: updated, input: "" };
		});

		ws.send(JSON.stringify({ type: WS_SEND, message: text, attachments }));
	},

	resolveHumanRequest: (requestId, response) => {
		const { ws } = get();
		// Optimistic update
		set((state) => {
			const updated = new Map(state.humanRequests);
			const existing = updated.get(requestId);
			if (existing) {
				updated.set(requestId, {
					...existing,
					status: "resolved",
					response,
					resolvedAt: Date.now(),
				});
			}
			return { humanRequests: updated };
		});
		ws.send(
			JSON.stringify({
				type: WS_RESOLVE_HUMAN_REQUEST,
				requestId,
				response,
				dismissed: false,
			}),
		);
	},

	dismissHumanRequest: (requestId) => {
		const { ws } = get();
		// Optimistic update
		set((state) => {
			const updated = new Map(state.humanRequests);
			const existing = updated.get(requestId);
			if (existing) {
				updated.set(requestId, {
					...existing,
					status: "dismissed",
					resolvedAt: Date.now(),
				});
			}
			return { humanRequests: updated };
		});
		ws.send(
			JSON.stringify({
				type: WS_RESOLVE_HUMAN_REQUEST,
				requestId,
				response: "",
				dismissed: true,
			}),
		);
	},
}));

export { getConversationId };
export type { FileAttachment, HumanRequest, Message, MessagePart };
