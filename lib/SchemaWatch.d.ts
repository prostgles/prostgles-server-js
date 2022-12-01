/// <reference types="node" />
import { DboBuilder } from "./DboBuilder";
import { ProstglesInitOptions } from "./Prostgles";
export declare type VoidFunction = () => void;
export declare class SchemaWatch {
    schema_checkIntervalMillis?: NodeJS.Timeout;
    loaded: boolean;
    constructor({ watchSchema, watchSchemaType, tsGeneratedTypesDir, currDbuilder, onSchemaChanged }: ProstglesInitOptions & {
        currDbuilder: DboBuilder;
        onSchemaChanged: VoidFunction;
    });
}
//# sourceMappingURL=SchemaWatch.d.ts.map