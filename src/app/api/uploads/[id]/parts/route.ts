import { handleUploadParts } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => handleUploadParts(req, (await ctx.params).id);
