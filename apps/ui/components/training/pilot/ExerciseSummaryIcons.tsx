"use client";
import React from "react";
import {ArrowLeft, ArrowLeftRight, ArrowRight, BookOpenCheck, LibraryBig} from "lucide-react";
import type {SourceWordStatus} from "@/lib/training/sourceWordSelection";
import type {TrainingMode} from "@/lib/types";

export function SourceWordIcon({status}:{status:SourceWordStatus}) {
 const Icon=status==="learning"?BookOpenCheck:LibraryBig;
 return <Icon size={14} aria-hidden="true"/>;
}
export function DirectionIcon({modes}:{modes:readonly TrainingMode[]}) {
 const direct=modes.includes("word-to-definition"), reverse=modes.includes("definition-to-word");
 if(!direct&&!reverse)return null;
 const Icon=direct&&reverse?ArrowLeftRight:direct?ArrowRight:ArrowLeft;
 return <Icon size={15} aria-hidden="true"/>;
}
