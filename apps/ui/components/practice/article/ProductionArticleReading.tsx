"use client";

import React from "react";
import {ArticleReadingFrame} from "./ArticleContent";
import theme from "../ui/practiceTheme.module.css";
import s from "./productionArticleReading.module.css";

/** Uses inherited account reading preferences and the app's existing dark class.
 * No local storage or preference writes; the four-step preference migration is separate.
 */
export function ProductionArticleReading({children}:{children:React.ReactNode}){
 return <div className={`${theme.theme} ${s.bridge}`} data-colour-mode="app" data-article-presentation="approved-v1"><ArticleReadingFrame>{children}</ArticleReadingFrame></div>;
}
