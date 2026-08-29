import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import "./index.css";
import App from "./App.tsx";
import { queryClient, persister } from "./queryClient.ts";
import { TooltipProvider } from "./components/ui/tooltip.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <TooltipProvider delayDuration={450}>
        <App />
      </TooltipProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
