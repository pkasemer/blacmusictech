import { handleAdminProxy } from "@/server/handlers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };
const run = async (req: Request, ctx: Ctx) => handleAdminProxy(req, (await ctx.params).path);

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
