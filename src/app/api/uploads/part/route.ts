import { handleUploadPart } from "@/server/handlers";

export const dynamic = "force-dynamic";
export const PUT = (req: Request) => handleUploadPart(req);
