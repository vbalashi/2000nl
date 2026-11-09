import {notFound} from 'next/navigation';
import {SearchBoundaryPreview} from './preview';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <SearchBoundaryPreview/>;}
