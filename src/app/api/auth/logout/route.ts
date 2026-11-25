import { handleLogout } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => handleLogout(req);
