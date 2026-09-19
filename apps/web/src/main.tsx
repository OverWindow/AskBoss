import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";
import "./styles/tokens.css";
import "./styles/globals.css";
import { SERVICE_NAME } from "./config/brand";
document.title = SERVICE_NAME;
createRoot(document.getElementById("root")!).render(<StrictMode><AppProviders><AppRouter /></AppProviders></StrictMode>);
