import {createShareIntentJournal} from './shareIntentJournal';
const journal=createShareIntentJournal('2000nl.pending-unsubscribe.v1.','unsubscribe');
export const readUnsubscribeJournal=journal.read,retainUnsubscribeJournal=journal.retain,clearUnsubscribeJournal=journal.clear;
export {tabShareIntentStore as tabUnsubscribeStore} from './shareIntentJournal';
