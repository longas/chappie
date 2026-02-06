import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { AgentMailClient } from "agentmail";
import { z } from "zod";

export function createEmailServer() {
	const client = new AgentMailClient({
		apiKey: Bun.env.AGENTMAIL_API_KEY,
	});

	return createSdkMcpServer({
		name: "email",
		tools: [
			tool(
				"send_email",
				"Send an email.",
				{
					to: z.string().describe("Recipient email address"),
					subject: z.string().describe("Email subject"),
					body: z.string().describe("Email body text"),
				},
				async (args) => {
					try {
						await client.inboxes.messages.send("chapie@agentmail.to", {
							to: args.to,
							subject: args.subject,
							text: args.body,
						});
						return {
							content: [
								{
									type: "text",
									text: `Email sent to ${args.to}`,
								},
							],
						};
					} catch (error) {
						return {
							content: [
								{
									type: "text",
									text: `Failed to send email: ${error}`,
								},
							],
							isError: true,
						};
					}
				},
			),
		],
	});
}
