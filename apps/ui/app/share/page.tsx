import {notFound} from 'next/navigation';
import {ShareLanding} from './ShareLanding';
export const dynamic='force-dynamic';
export default function SharePage(){
 if(process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED!=='true')notFound();
 return <ShareLanding/>;
}
