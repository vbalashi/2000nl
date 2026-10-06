import {notFound} from "next/navigation";
import {ControlsStandardReview} from "./ControlsStandardReview";
export default function Page(){if(process.env.NODE_ENV==="production")notFound();return <ControlsStandardReview/>;}
