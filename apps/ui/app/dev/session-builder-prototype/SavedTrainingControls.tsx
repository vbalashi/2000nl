"use client";
import React, { useContext } from "react";
import { InterfaceLanguageContext } from "./VariantControls";
import { SavedTrainingControls as SharedSavedTrainingControls } from "@/components/practice/SavedTrainingControls";
export function SavedTrainingControls(props: { name: string; main: boolean; hasOthers: boolean; onMain: () => void; onDelete: () => void }) {
  return <SharedSavedTrainingControls {...props} language={useContext(InterfaceLanguageContext)} />;
}
