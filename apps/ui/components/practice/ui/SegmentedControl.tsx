"use client";
import React from "react";
import s from "./segmentedControl.module.css";
export function SegmentedControl({label,children}:{label:string;children:React.ReactNode}){return <div className={s.control} role="group" aria-label={label}>{children}</div>;}
