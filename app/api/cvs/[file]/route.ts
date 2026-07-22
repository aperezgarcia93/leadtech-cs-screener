import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const safe = path.basename(file); // no traversal
  if (!safe.endsWith(".pdf")) return new Response("Not found", { status: 404 });
  try {
    const buffer = await readFile(path.join(process.cwd(), "data", "cvs", safe));
    return new Response(new Uint8Array(buffer), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${safe}"` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
