import {HeadwordFitPreview} from "./preview";
export default function Page(){return process.env.NODE_ENV === "production" ? null : <HeadwordFitPreview/>;}
