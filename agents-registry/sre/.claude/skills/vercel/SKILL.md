---
name: vercel
description: Use when asked to manage Vercel infrastructure — deploying apps, creating projects, managing domains, environment variables, or checking deployment status.
---

# Vercel Infrastructure Management

## Purpose

Manage Vercel infrastructure using the `vercel` CLI. This covers the full lifecycle: creating projects, deploying, managing domains, environment variables, and monitoring deployments.

## Prerequisites

- The `vercel` CLI must be installed and authenticated (`vercel login`)

## Overview of Capabilities

**Projects**
- `vercel project add <name>` — create a new project
- `vercel project ls` — list all projects
- `vercel project rm <name>` — remove a project
- `vercel link` — link current directory to a Vercel project

**Deployments**
- `vercel` — deploy the current project (preview)
- `vercel --prod` — deploy to production
- `vercel ls` — list recent deployments
- `vercel inspect <url>` — show deployment details
- `vercel promote <deployment>` — promote a deployment to production
- `vercel rollback` — roll back to a previous deployment
- `vercel redeploy` — redeploy the latest deployment

**Domains**
- `vercel domains add <domain>` — add a domain
- `vercel domains ls` — list domains
- `vercel domains rm <domain>` — remove a domain

**Environment Variables**
- `vercel env add <key>` — add an environment variable
- `vercel env rm <key>` — remove an environment variable
- `vercel env ls` — list environment variables
- `vercel env pull .env.local` — pull env vars to a local file

**Logs & Monitoring**
- `vercel logs <url>` — view deployment logs

**DNS**
- `vercel dns add <domain> <record>` — add a DNS record
- `vercel dns ls <domain>` — list DNS records

## Steps

1. Determine what the user needs (deploy, create project, manage env vars, etc.)
2. Run the appropriate `vercel` command from the project workspace
3. Parse the CLI output and report the result clearly

## Verification

- For deployments: confirm the deployment URL is returned and accessible
- For project creation: confirm the project appears in `vercel project ls`
- For env vars: confirm with `vercel env ls`

## Troubleshooting

### Need more details on a specific command
Run `vercel <command> --help` for full usage information and available flags.
