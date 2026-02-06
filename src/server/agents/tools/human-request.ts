import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { W_HUMAN_REQUEST } from "../worker-events.ts";

type HumanRequest = {
	id: string;
	title: string;
	description: string;
	status: "pending" | "resolved" | "dismissed";
	response?: string;
	createdAt: number;
	resolvedAt?: number;
};

type HumanRequestPayload = {
	type: typeof W_HUMAN_REQUEST;
	requestId: string;
	agentName: string;
	title: string;
	description: string;
};

export function createHumanRequestServer(
	agentName: string,
	postMessage: (msg: HumanRequestPayload) => void,
) {
	const requests = new Map<string, HumanRequest>();

	const server = createSdkMcpServer({
		name: "human-request",
		tools: [
			tool(
				"request_human",
				"Formally request information, approval, or action from the human operator. Use this ONLY when you need something that no agent can provide, or you are blocked without human input. After submitting, continue with other work — the response will arrive as a message.",
				{
					title: z.string().describe("Short title summarizing the request"),
					description: z
						.string()
						.describe("Detailed description of what you need from the human"),
				},
				async (args) => {
					const requestId = crypto.randomUUID();

					requests.set(requestId, {
						id: requestId,
						title: args.title,
						description: args.description,
						status: "pending",
						createdAt: Date.now(),
					});

					postMessage({
						type: W_HUMAN_REQUEST,
						requestId,
						agentName,
						title: args.title,
						description: args.description,
					});

					return {
						content: [
							{
								type: "text",
								text: `Request submitted (${requestId}). The human will be notified. Continue working on other tasks — the response will arrive as a message.`,
							},
						],
					};
				},
			),
			tool(
				"list_human_requests",
				"List all human requests you have made, with their current status and any responses.",
				{},
				async () => {
					if (requests.size === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No human requests have been made.",
								},
							],
						};
					}

					const lines = Array.from(requests.values()).map((req) => {
						let line = `- ${req.id} "${req.title}" — ${req.status}`;
						if (req.response) {
							line += ` | Response: ${req.response}`;
						}
						return line;
					});

					return {
						content: [{ type: "text", text: lines.join("\n") }],
					};
				},
			),
			tool(
				"cancel_human_request",
				"Cancel a pending human request by its ID.",
				{
					requestId: z.string().describe("The request ID to cancel"),
				},
				async (args) => {
					const request = requests.get(args.requestId);
					if (!request) {
						return {
							content: [
								{
									type: "text",
									text: `No request found with ID "${args.requestId}".`,
								},
							],
							isError: true,
						};
					}

					if (request.status !== "pending") {
						return {
							content: [
								{
									type: "text",
									text: `Request "${args.requestId}" is already ${request.status}.`,
								},
							],
							isError: true,
						};
					}

					requests.delete(args.requestId);

					return {
						content: [
							{
								type: "text",
								text: `Cancelled request "${request.title}" (${args.requestId}).`,
							},
						],
					};
				},
			),
		],
	});

	function resolveRequest(
		requestId: string,
		response: string,
		dismissed: boolean,
	) {
		const request = requests.get(requestId);
		if (request) {
			request.status = dismissed ? "dismissed" : "resolved";
			request.response = response;
			request.resolvedAt = Date.now();
		}
	}

	function cleanup() {
		requests.clear();
	}

	return { server, resolveRequest, cleanup };
}
