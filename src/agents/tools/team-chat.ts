import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { W_SEND } from "../worker-events.ts";

type SendPayload = {
	type: typeof W_SEND;
	to: string;
	message: string;
};

export function createTeamChatServer(
	agentName: string,
	postMessage: (msg: SendPayload) => void,
) {
	return createSdkMcpServer({
		name: "team-chat",
		tools: [
			tool(
				"team_chat",
				"Send a message to another agent.",
				{
					to: z.string().describe("Target agent name"),
					message: z.string().describe("Message content"),
				},
				async (args) => {
					if (args.to === agentName) {
						return {
							content: [
								{
									type: "text",
									text: "Cannot message yourself",
								},
							],
							isError: true,
						};
					}
					postMessage({
						type: W_SEND,
						to: args.to,
						message: args.message,
					});
					return {
						content: [
							{
								type: "text",
								text: `Message sent to ${args.to}`,
							},
						],
					};
				},
			),
		],
	});
}
