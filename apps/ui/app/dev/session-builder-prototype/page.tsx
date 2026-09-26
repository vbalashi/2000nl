import { notFound } from "next/navigation";
import { BuilderPrototype } from "./BuilderPrototype";

export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BuilderPrototype />;
}
