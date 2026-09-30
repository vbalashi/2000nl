"use client";
import React, { useContext } from "react";
import { NounFilterPopover as SharedPopover } from "@/components/practice/library/NounFilterPopover";
import { InterfaceLanguageContext } from "./VariantControls";
export function NounFilterPopover(props: Omit<React.ComponentProps<typeof SharedPopover>, "locale">) {
 return <SharedPopover {...props} locale={useContext(InterfaceLanguageContext)}/>;
}
