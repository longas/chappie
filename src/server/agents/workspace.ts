import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from "node:fs";

type AgentRegistry = Record<string, string>;

export type WorkspaceResult = {
	agentNames: string[];
	agentRegistry: AgentRegistry;
};

export async function createWorkspaces(
	registryPath: string,
	workspacesPath: string,
): Promise<WorkspaceResult> {
	// Read agent descriptions from registry
	const entries = readdirSync(registryPath, { withFileTypes: true });
	const agentRegistry: AgentRegistry = {};

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const descFile = Bun.file(`${registryPath}/${entry.name}/DESCRIPTION.md`);
		if (!(await descFile.exists())) {
			throw new Error(`Agent "${entry.name}" is missing DESCRIPTION.md`);
		}
		agentRegistry[entry.name] = await descFile.text();
	}

	const agentNames = Object.keys(agentRegistry);

	// Create or update workspaces (preserves existing files)
	mkdirSync(workspacesPath, { recursive: true });

	for (const agentName of agentNames) {
		const agentRegistryPath = `${registryPath}/${agentName}`;
		const workspace = `${workspacesPath}/${agentName}`;
		mkdirSync(workspace, { recursive: true });

		// Copy .claude directory if it exists (skills, settings, etc.)
		const claudeDir = `${agentRegistryPath}/.claude`;
		if (existsSync(claudeDir)) {
			cpSync(claudeDir, `${workspace}/.claude`, { recursive: true });
		}

		// Generate CLAUDE.md from ROLE.md
		const claudeMd = await buildClaudeMd(agentRegistryPath);
		writeFileSync(`${workspace}/CLAUDE.md`, claudeMd);

		// Generate TEAM.md listing other agents
		const otherAgents = agentNames.filter((n) => n !== agentName);
		if (otherAgents.length > 0) {
			const teamMd = buildTeamMd(otherAgents, agentRegistry);
			writeFileSync(`${workspace}/TEAM.md`, teamMd);
		}
	}

	return { agentNames, agentRegistry };
}

// --- CLAUDE.md builder ---

const MANDATORY_SECTION = `## MANDATORY: First Thing Every Session

**STOP. Before responding to the user, you MUST read this file first:**

- \`TEAM.md\`: the agents you can collaborate with`;

const HUMAN_REQUEST_SECTION = `## Requesting Help from the Human

You have a \`request_human\` tool to formally request something from the human operator.
Use this ONLY when you need information/approval that no agent can provide, or you are
blocked without human input. After submitting, continue with other work — the human's
response will arrive as a message.`;

const TEAM_SECTION = `## Your Team

You are part of a team of specialized agents. Each teammate has unique skills and you can collaborate with them to get things done.

Use the \`team_chat\` tool to reach out to your teammates. Check \`TEAM.md\` to see who's available and what they can help with.

- **Communicate directly.** If you need information from someone, reach out to them directly instead of going through others.
- **Reply only when it adds value.** You don't need to reply to every message — only when it makes sense based on the conversation. The exception is the CEO: always reply with your updates.
- **Everyone has the same tools.** All teammates have access to the same tools you do. Delegate based on expertise, not tool access.`;

async function buildClaudeMd(agentPath: string): Promise<string> {
	const roleFile = Bun.file(`${agentPath}/ROLE.md`);
	if (!(await roleFile.exists())) {
		throw new Error(`Missing ROLE.md in ${agentPath}`);
	}
	const role = await roleFile.text();

	const sections = [
		"# CLAUDE.md",
		MANDATORY_SECTION,
		TEAM_SECTION,
		HUMAN_REQUEST_SECTION,
		`## Role\n\n${role.trim()}`,
	];

	return `${sections.join("\n\n")}\n`;
}

// --- TEAM.md builder ---

function buildTeamMd(otherAgents: string[], registry: AgentRegistry): string {
	let teamMd = "# Your Teammates\n\n";
	for (const agent of otherAgents) {
		const description = registry[agent] ?? "";
		teamMd += `<teammate name="${agent}">\n${description.trim()}\n</teammate>\n\n`;
	}
	return teamMd;
}
