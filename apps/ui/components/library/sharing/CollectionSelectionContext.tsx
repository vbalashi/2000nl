'use client';
import {createContext,useContext} from 'react';
import type {TrainingCollection} from '@/lib/collections/sharing/trainingCollectionCatalogContract';
import type {PersonalCollection} from '@/lib/collections/sharing/personalCatalogContract';
export type CollectionSelectionScope={userId:string;languageCode:string;onTrainingResolved?:(ids:string[],rows:TrainingCollection[])=>void;onBrowseSelected?:(row:PersonalCollection)=>void};
export const CollectionSelectionContext=createContext<CollectionSelectionScope|null>(null);
export const useCollectionSelectionScope=()=>useContext(CollectionSelectionContext);
