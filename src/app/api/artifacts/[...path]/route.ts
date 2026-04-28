import { promises as fs } from "node:fs";

import { NextResponse } from "next/server";

import { resolveArtifactPath } from "@/lib/probes/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const relativePath = path.join("/");
  const absolutePath = resolveArtifactPath(relativePath);

  if (!absolutePath) {
    return NextResponse.json({ error: "Invalid artifact path." }, { status: 400 });
  }

  try {
    const data = await fs.readFile(absolutePath);
    const contentType = absolutePath.endsWith(".png") ? "image/png" : "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
}
