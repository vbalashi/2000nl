"use client";
import React, {forwardRef, type ButtonHTMLAttributes} from "react";
import s from "./primitives.module.css";
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {label:string};
/** One focus treatment, non-submit default and accessible name for icon-only actions. */
export const IconAction=forwardRef<HTMLButtonElement,Props>(function IconAction({label,className="",type="button",children,...props},ref){
 return <button {...props} ref={ref} type={type} aria-label={label} className={`${s.iconAction} ${className}`}>{children}</button>;
});
