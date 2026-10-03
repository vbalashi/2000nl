import {notFound} from 'next/navigation';
import {Audit} from './study';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <Audit/>;}
