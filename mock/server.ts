import { createMock, MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD } from "./mock";

const port = Number(process.env.MOCK_PORT ?? 8090);
const mock = createMock({ accessTtl: Number(process.env.MOCK_ACCESS_TTL ?? 900) });
await mock.listen(port);
console.log(`Mock Blac Music admin API on http://127.0.0.1:${port}`);
console.log(`Sign in with ${MOCK_ADMIN_EMAIL} / ${MOCK_ADMIN_PASSWORD}`);
