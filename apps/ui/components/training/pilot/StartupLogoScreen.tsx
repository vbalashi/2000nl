"use client";
import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import s from "./startupLogo.module.css";

/** Neutral startup surface: account appearance remains server-owned. */
export function StartupLogoScreen({children}:{children:React.ReactNode}) {
  return <div className={s.startup} data-testid="startup-logo-screen">
    <BrandLogo className={s.logo} accentClassName={s.ink} />
    <div className={s.status}>{children}</div>
  </div>;
}
