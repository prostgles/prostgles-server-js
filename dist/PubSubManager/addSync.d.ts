import { PubSubManager } from "./PubSubManager";
import { AddSyncParams } from "./PubSubManager";
/**
 * Returns a sync channel
 * A sync channel is unique per socket for each filter
 */
export declare function addSync(this: PubSubManager, syncParams: AddSyncParams): Promise<string>;
//# sourceMappingURL=addSync.d.ts.map