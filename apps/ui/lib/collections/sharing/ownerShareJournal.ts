import {createShareIntentJournal} from './shareIntentJournal';
const journal=createShareIntentJournal('2000nl.pending-owner-share.v1.','owner');
export const readOwnerShareJournal=journal.read,retainOwnerShareJournal=journal.retain,clearOwnerShareJournal=journal.clear;
export {tabShareIntentStore as ownerShareStore} from './shareIntentJournal';
