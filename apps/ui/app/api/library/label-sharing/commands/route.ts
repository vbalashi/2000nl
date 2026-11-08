import {NextRequest} from 'next/server';
import {runLabelShareCommand} from '@/lib/collections/sharing/labelSharingRoutes';
export const dynamic='force-dynamic';
export const POST=(request:NextRequest)=>runLabelShareCommand(request,false);
