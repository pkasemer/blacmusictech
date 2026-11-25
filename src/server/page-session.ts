// Session access for server components (read only: cookies can only be written by route handlers).

import { cookies } from "next/headers";
import { getConfig } from "./config";
import { unseal } from "./session";

export async function getPageSession() {
  const jar = await cookies();
  return unseal(jar.get(getConfig().cookieName)?.value);
}
