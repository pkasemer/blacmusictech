import { handleGenres } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handleGenres(req);
