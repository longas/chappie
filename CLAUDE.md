# Chappie

This is a Bun project. For Bun-specific commands, APIs, and patterns, see [BUN.md](./BUN.md).

## Styling & UI

- Always use Tailwind CSS for styling. Don't use inline styles or CSS-in-JS.
- Use `tw-animate-css` for animations. Don't use custom CSS animations.
- Use shadcn/ui components when building UIs. Use the shadcn MCP to search, view, and install components.
- Never modify shadcn component files directly. Apply styling or behavior changes through props and className.
- Import the `cn` utility from `@/lib/utils` for conditional class merging.

## Rules

- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
- After completing code changes, run `bun run fix` then `bun run typecheck` to ensure code quality.
