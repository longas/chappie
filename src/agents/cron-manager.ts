import { Cron } from "croner";
import { W_CRON_FIRE } from "./worker-events.ts";

export type CronJob = {
	id: string;
	name: string;
	message: string;
	schedule: string;
	scheduleType: "cron-pattern" | "iso-datetime" | "seconds";
	cron: Cron;
	oneTime: boolean;
};

export type CronFirePayload = {
	type: typeof W_CRON_FIRE;
	jobId: string;
	jobName: string;
	message: string;
};

export class CronManager {
	private jobs = new Map<string, CronJob>();
	private agentName: string;
	private onFire: (payload: CronFirePayload) => void;

	constructor(agentName: string, onFire: (payload: CronFirePayload) => void) {
		this.agentName = agentName;
		this.onFire = onFire;
	}

	schedule(args: {
		name: string;
		message: string;
		scheduleType: "cron-pattern" | "iso-datetime" | "seconds";
		schedule: string;
	}): { jobId: string; nextRun: string | null } | { error: string } {
		const jobId = `${this.agentName}-${crypto.randomUUID()}`;
		const oneTime = args.scheduleType !== "cron-pattern";

		let pattern: string;
		if (args.scheduleType === "seconds") {
			const delayMs = Number.parseInt(args.schedule, 10) * 1000;
			pattern = new Date(Date.now() + delayMs).toISOString();
		} else {
			pattern = args.schedule;
		}

		try {
			const cron = new Cron(
				pattern,
				{ maxRuns: oneTime ? 1 : undefined },
				() => {
					this.onFire({
						type: W_CRON_FIRE,
						jobId,
						jobName: args.name,
						message: args.message,
					});

					if (oneTime) {
						this.jobs.delete(jobId);
					}
				},
			);

			this.jobs.set(jobId, {
				id: jobId,
				name: args.name,
				message: args.message,
				schedule: args.schedule,
				scheduleType: args.scheduleType,
				cron,
				oneTime,
			});

			const nextRun = cron.nextRun();
			return { jobId, nextRun: nextRun?.toISOString() ?? null };
		} catch (e) {
			return {
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}

	list(): CronJob[] {
		return Array.from(this.jobs.values());
	}

	cancel(jobId: string): CronJob | null {
		const job = this.jobs.get(jobId);
		if (!job) return null;

		job.cron.stop();
		this.jobs.delete(jobId);
		return job;
	}

	cleanup(): void {
		for (const job of this.jobs.values()) {
			job.cron.stop();
		}
		this.jobs.clear();
	}
}
