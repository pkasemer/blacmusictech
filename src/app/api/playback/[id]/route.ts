import { handlePlayback } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => handlePlayback(req, (await ctx.params).id);
