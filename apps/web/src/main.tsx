import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";
import "./styles/tokens.css";
import "./styles/globals.css";
import { SERVICE_NAME, SERVICE_TAGLINE } from "./config/brand";
document.title = `${SERVICE_NAME} · ${SERVICE_TAGLINE}`;
createRoot(document.getElementById("root")!).render(<StrictMode><AppProviders><AppRouter /></AppProviders></StrictMode>);
