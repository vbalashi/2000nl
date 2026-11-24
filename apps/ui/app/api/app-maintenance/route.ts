// Deployments with maintenance support serve this path independently of the app.
export function GET() {
  return Response.json({ phase: "available" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
