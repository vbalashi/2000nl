import {NextRequest} from 'next/server';
import {runLabelShareCommand} from '../commands/route';
export const dynamic='force-dynamic';
export const POST=(request:NextRequest)=>runLabelShareCommand(request,true);
