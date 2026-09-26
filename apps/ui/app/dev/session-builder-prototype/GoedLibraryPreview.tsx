"use client";
import React,{useState} from "react";
import {LibrarySenseCardGroup} from "@/components/training/library-v2/LibrarySenseCardGroup";
import type {LibrarySenseCardGroupModel} from "@/components/training/library-v2/librarySenseCardModel";
import data from "./goed-source-fixture.json";
import s from "./library.module.css";
export const goedGroups=data as LibrarySenseCardGroupModel[];
export function GoedLibraryPreview({index}:{index:number}){const [notice,setNotice]=useState("");return <div className={s.realPreview}><LibrarySenseCardGroup key={index} model={goedGroups[index]} interfaceLanguage="en" translationEnabled onPlayAudio={()=>setNotice("Audio preview: no request is sent.")} onRequestTranslation={()=>setNotice("Translation preview: no request is sent.")} onTrainNext={()=>setNotice("Training preview: no session is started.")} onAction={()=>setNotice("Preview only: learning state is unchanged.")}/><p role="status" className={s.sourceNotice}>{notice||"Local source content · ordinary meanings · preview actions"}</p></div>}
