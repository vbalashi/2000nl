"use client";
import React from "react";
import {Search} from "lucide-react";
import s from "./searchField.module.css";
/** One search surface across Words, Collections and Shared; callers own state. */
export function SearchField({children,className=""}:{children:React.ReactNode;className?:string}){
 return <div className={`${s.field} ${className}`}><Search size={18} aria-hidden="true"/>{children}</div>;
}
