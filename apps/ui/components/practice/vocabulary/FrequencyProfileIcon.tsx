"use client";
import React from "react";
import {FileText, MessageCircle} from "lucide-react";
import type {FrequencyProfile} from "@/lib/vocabulary/selection";

/** Same symbols as the Library's frequency sorting control. */
export function FrequencyProfileIcon({profile,size=14}:{profile:FrequencyProfile;size?:number}){
 const Icon=profile==="spoken"?MessageCircle:FileText;
 return <Icon size={size} aria-hidden="true"/>;
}
