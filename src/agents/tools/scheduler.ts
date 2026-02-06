import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CronManager } from "../cron-manager.ts";

export function createSchedulerServer(manager: CronManager) {
	return createSdkMcpServer({
		name: "scheduler",
		tools: [
			tool(
				"schedule",
				"Schedule a one-time or recurring task.",
				{
					name: z
						.string()
						.describe('Short identifier for the job (e.g. "daily-check")'),
					message: z
						.string()
						.describe("What the agent should do when the job fires"),
					scheduleType: z
						.enum(["cron-pattern", "iso-datetime", "seconds"])
						.describe("Type of schedule value"),
					schedule: z
						.string()
						.describe(
							'The schedule value. Cron pattern (e.g. "0 9 * * *"), ISO datetime (e.g. "2025-03-01T09:00:00"), or delay in seconds (e.g. "300")',
						),
				},
				async (args) => {
					const result = manager.schedule(args);

					if ("error" in result) {
						return {
							content: [
								{
									type: "text",
									text: `Failed to schedule job: ${result.error}`,
								},
							],
							isError: true,
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `Scheduled job "${args.name}" (${result.jobId}). Next run: ${result.nextRun ?? "unknown"}.`,
							},
						],
					};
				},
			),
			tool(
				"list_schedules",
				"List all active scheduled jobs for this agent.",
				{},
				async () => {
					const jobs = manager.list();

					if (jobs.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: "No active scheduled jobs.",
								},
							],
						};
					}

					const lines = jobs.map((job) => {
						const nextRun = job.cron.nextRun();
						return `- ${job.id} "${job.name}" | ${job.scheduleType}: ${job.schedule} | next: ${nextRun?.toISOString() ?? "none"} | ${job.oneTime ? "one-time" : "recurring"}`;
					});

					return {
						content: [{ type: "text", text: lines.join("\n") }],
					};
				},
			),
			tool(
				"cancel_schedule",
				"Cancel an active scheduled job by its ID.",
				{
					jobId: z.string().describe("The job ID to cancel"),
				},
				async (args) => {
					const job = manager.cancel(args.jobId);

					if (!job) {
						return {
							content: [
								{
									type: "text",
									text: `No active job found with ID "${args.jobId}".`,
								},
							],
							isError: true,
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `Cancelled job "${job.name}" (${args.jobId}).`,
							},
						],
					};
				},
			),
		],
	});
}
