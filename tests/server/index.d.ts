declare module "client_only_queries" {
    import { DBHandlerClient } from "client/index";
    export default function client_only(db: DBHandlerClient): Promise<unknown>;
}
declare module "client/index" {
    export { DBHandlerClient } from "prostgles-client/dist/prostgles";
}
declare module "isomorphic_queries" {
    import { DbHandler } from "../dist/Prostgles";
    import { DBHandlerClient } from "client/index";
    export default function isomorphic(db: Partial<DbHandler> | Partial<DBHandlerClient>): Promise<void>;
}
declare module "server_only_queries" {
    export default function f(db: any): Promise<void>;
}
declare module "server/index" { }
//# sourceMappingURL=index.d.ts.map