import {notFound} from 'next/navigation';
import {UpdatesPreview} from './preview';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <UpdatesPreview/>;}
