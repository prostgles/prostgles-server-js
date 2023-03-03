import { JSONB } from "prostgles-types";
export declare function validate<T>(obj: T, key: keyof T, rawFieldType: JSONB.FieldType): boolean;
export declare function validateSchema<S extends JSONB.ObjectType["type"]>(schema: S, obj: JSONB.GetObjectType<S>, objName?: string, optional?: boolean): void;
type ColOpts = {
    nullable?: boolean;
};
export declare function getJSONBSchemaTSTypes(schema: JSONB.JSONBSchema, colOpts: ColOpts, outerLeading?: string): string;
export {};
//# sourceMappingURL=validation.d.ts.map