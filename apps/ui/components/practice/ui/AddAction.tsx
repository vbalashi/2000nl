"use client";
import React from "react";
import { Plus } from "lucide-react";
import s from "./addAction.module.css";
export function AddAction({children,className="",...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){
 return <button {...props} type="button" className={`${s.action} ${className}`}><Plus size={16} aria-hidden="true"/>{children}</button>;
}
