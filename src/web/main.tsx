import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { RootLayout } from "./layouts/root-layout";
import { queryClient } from "./lib/query-client";
import { AgentDetailPage } from "./pages/agent-detail";
import { AgentsPage } from "./pages/agents";
import { ChatPage } from "./pages/chat";
import "./styles.css";

const router = createBrowserRouter([
	{
		path: "/",
		element: <RootLayout />,
		children: [
			{ index: true, element: <ChatPage /> },
			{ path: "agents", element: <AgentsPage /> },
			{ path: "agents/:name", element: <AgentDetailPage /> },
		],
	},
]);

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}
