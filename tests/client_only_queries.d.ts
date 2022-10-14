import type { DBHandlerClient, Auth } from "./client/index";
import { DBSchemaTable } from "prostgles-types";
export default function client_only(db: Required<DBHandlerClient>, auth: Auth, log: (...args: any[]) => any, methods: any, tableSchema: DBSchemaTable[]): Promise<void>;
//# sourceMappingURL=client_only_queries.d.ts.map