import { lazy,Suspense } from "react";
import { BrowserRouter,Navigate,Route,Routes,useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "../components/ErrorBoundary";
const MainPage=lazy(()=>import("../pages/MainPage").then(module=>({default:module.MainPage})));
const BossOnboardingPage=lazy(()=>import("../pages/BossOnboardingPage").then(module=>({default:module.BossOnboardingPage})));
const HrDemoPage=lazy(()=>import("../pages/HrDemoPage").then(module=>({default:module.HrDemoPage})));
const SettingsPage=lazy(()=>import("../pages/SettingsPage").then(module=>({default:module.SettingsPage})));
const AdminPage=lazy(()=>import("../pages/AdminPage").then(module=>({default:module.AdminPage})));
function AnimatedRoutes(){const location=useLocation();return <AnimatePresence mode="wait" initial={false}><Routes location={location} key={location.pathname}><Route path="/" element={<MainPage/>}/><Route path="/boss/new" element={<BossOnboardingPage/>}/><Route path="/hr-demo" element={<HrDemoPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/admin/*" element={<AdminPage/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AnimatePresence>}
export function AppRouter(){return <BrowserRouter><ErrorBoundary><Suspense fallback={<div className="loading-state"><div className="spinner"/></div>}><AnimatedRoutes/></Suspense></ErrorBoundary></BrowserRouter>;}
