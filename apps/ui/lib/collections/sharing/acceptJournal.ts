import {createShareIntentJournal} from './shareIntentJournal';
const journal=createShareIntentJournal('2000nl.pending-share-accept.v1.','accept');
export const readAcceptJournal=journal.read,retainAcceptJournal=journal.retain,clearAcceptJournal=journal.clear;
export {tabShareIntentStore as tabAcceptStore} from './shareIntentJournal';
