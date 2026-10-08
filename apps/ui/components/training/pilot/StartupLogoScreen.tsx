"use client";
import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import s from "./startupLogo.module.css";

/** Startup appearance is a cosmetic hint; account preferences remain authoritative. */
export function StartupLogoScreen({children}:{children:React.ReactNode}) {
  return <div className={s.startup} data-testid="startup-logo-screen">
    <BrandLogo className={s.logo} accentClassName={s.ink} />
    <div className={s.status}>{children}</div>
  </div>;
}
