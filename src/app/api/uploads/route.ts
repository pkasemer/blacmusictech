import { handleUploadCreate } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => handleUploadCreate(req);
