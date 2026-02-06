import { mkdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { AgentMail } from "agentmail";
import { Webhook } from "svix";
import type { FileAttachment } from "./agents/orchestrator.ts";
import { AgentsOrchestrator } from "./agents/orchestrator.ts";
import {
	getLanguageFromFilename,
	isPathSafe,
	scanFileTree,
} from "./api/agents.ts";
import { UPLOADS_DIR, WORKSPACES_DIR } from "./constants.ts";
import index from "./web/index.html";
import {
	WS_AGENTS,
	WS_CHANNEL,
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
} from "./ws-events.ts";

// AgentMail delivers webhooks via Svix. Every incoming webhook carries
// svix-id, svix-signature, and svix-timestamp headers that we verify
// against this secret to ensure the payload is authentic.
const wh = new Webhook(Bun.env.AGENTMAIL_WEBHOOK_SECRET!);

// Ensure the directory for user-uploaded files exists on startup.
mkdirSync(UPLOADS_DIR, { recursive: true });

const server = Bun.serve({
	port: 3000,

	routes: {
		"/": index,
		"/agents": index,
		"/agents/*": index,

		"/api/upload": {
			POST: async (req) => {
				const formData = await req.formData();
				const results: FileAttachment[] = [];

				for (const [, value] of formData) {
					if (!(value instanceof File)) continue;
					const id = crypto.randomUUID();
					const ext = extname(value.name);
					const filename = `${id}${ext}`;
					const filePath = `${UPLOADS_DIR}/${filename}`;
					await Bun.write(filePath, value);
					results.push({
						id,
						filename: value.name,
						mediaType: value.type,
						url: `/api/uploads/${filename}`,
					});
				}

				return Response.json(results);
			},
		},

		"/api/uploads/*": async (req) => {
			const url = new URL(req.url);
			const fileName = url.pathname.slice("/api/uploads/".length);
			const file = Bun.file(`${UPLOADS_DIR}/${fileName}`);
			if (await file.exists()) {
				return new Response(file);
			}
			return new Response("Not Found", { status: 404 });
		},

		"/api/agents": {
			GET: () => {
				return Response.json({
					agents: orchestrator.getAgentDescriptions(),
				});
			},
		},

		"/api/agents/:name/files": {
			GET: (req) => {
				const agentName = req.params.name;
				const workspace = `${WORKSPACES_DIR}/${agentName}`;
				try {
					const tree = scanFileTree(workspace, workspace);
					return Response.json({ tree });
				} catch {
					return Response.json({ error: "Agent not found" }, { status: 404 });
				}
			},
		},

		"/api/agents/:name/file": {
			GET: (req) => {
				const agentName = req.params.name;
				const url = new URL(req.url);
				const filePath = url.searchParams.get("path");
				if (!filePath) {
					return Response.json(
						{ error: "Missing path parameter" },
						{ status: 400 },
					);
				}

				const workspace = `${WORKSPACES_DIR}/${agentName}`;
				if (!isPathSafe(workspace, filePath)) {
					return Response.json({ error: "Invalid path" }, { status: 403 });
				}

				try {
					const fullPath = resolve(workspace, filePath);
					const content = readFileSync(fullPath, "utf-8");
					const filename = filePath.split("/").pop() ?? filePath;
					return Response.json({
						content,
						filename,
						language: getLanguageFromFilename(filename),
					});
				} catch {
					return Response.json({ error: "File not found" }, { status: 404 });
				}
			},
		},

		"/webhook/agentmail": {
			POST: async (req) => {
				const body = await req.text();
				const headers = {
					"svix-id": req.headers.get("svix-id") ?? "",
					"svix-signature": req.headers.get("svix-signature") ?? "",
					"svix-timestamp": req.headers.get("svix-timestamp") ?? "",
				};

				try {
					const payload = wh.verify(
						body,
						headers,
					) as AgentMail.MessageReceivedEvent;
					const { message } = payload;
					console.log("Email received:", message.subject);

					const content = [
						`[Email from ${message.from}]`,
						`Subject: ${message.subject}`,
						message.text ?? "",
					].join("\n");
					orchestrator.send(content);

					return new Response("OK", { status: 200 });
				} catch {
					return new Response("Invalid signature", { status: 401 });
				}
			},
		},
	},

	fetch(req, server) {
		const url = new URL(req.url);

		if (url.pathname === "/ws") {
			const success = server.upgrade(req);
			if (success) return undefined;
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		return new Response("Not Found", { status: 404 });
	},

	websocket: {
		open(ws) {
			ws.subscribe(WS_CHANNEL);
			ws.send(
				JSON.stringify({ type: WS_AGENTS, agents: orchestrator.getAgents() }),
			);
			ws.send(
				JSON.stringify({
					type: WS_HISTORY,
					conversations: orchestrator.getConversations(),
				}),
			);
			ws.send(
				JSON.stringify({
					type: WS_HUMAN_REQUESTS,
					requests: orchestrator.getHumanRequests(),
				}),
			);
			console.log("Client connected");
		},

		message(_ws, message) {
			const data = JSON.parse(message.toString());

			if (data.type === WS_SEND) {
				orchestrator.send(data.message, data.attachments);
			}

			if (data.type === WS_RESOLVE_HUMAN_REQUEST) {
				orchestrator.resolveHumanRequest(
					data.requestId,
					data.response,
					data.dismissed,
				);
			}
		},

		close(ws) {
			ws.unsubscribe(WS_CHANNEL);
			console.log("Client disconnected");
		},
	},
});

const orchestrator = new AgentsOrchestrator({
	registryPath: `${import.meta.dir}/../agents-registry`,
	workspacesPath: WORKSPACES_DIR,
	entryAgent: "ceo",
	onAgentResponse: (agent, turnId, text) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_RESPONSE, agent, turnId, text }),
		);
	},
	onAgentStatusChange: (agent, status) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_STATUS, agent, status }),
		);
	},
	onInterAgentMessage: (from, to, message) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_INTER_AGENT, from, to, message }),
		);
	},
	onTurnStart: (agent, turnId) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_TURN_START, agent, turnId }),
		);
	},
	onThinking: (agent, turnId, thinking) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_THINKING, agent, turnId, thinking }),
		);
	},
	onToolUse: (agent, turnId, toolUseId, toolName, input) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({
				type: WS_TOOL_USE,
				agent,
				turnId,
				toolUseId,
				toolName,
				input,
			}),
		);
	},
	onToolResult: (agent, turnId, toolUseId, isError) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({
				type: WS_TOOL_RESULT,
				agent,
				turnId,
				toolUseId,
				isError,
			}),
		);
	},
	onHumanRequest: (request) => {
		server.publish(
			WS_CHANNEL,
			JSON.stringify({ type: WS_HUMAN_REQUEST, request }),
		);
	},
});

await orchestrator.init();

console.log("Server running at http://localhost:3000");
