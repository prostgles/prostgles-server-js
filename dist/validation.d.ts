import { AnyObject } from "prostgles-types";
import { BaseColumn, JSONBColumnDef } from "./TableConfig";
declare type BaseOptions = {
    optional?: boolean;
    nullable?: boolean;
    description?: string;
    title?: string;
};
declare type SimpleType = BaseOptions & ({
    type: "number" | "boolean" | "integer" | "string" | "any" | "number[]" | "boolean[]" | "integer[]" | "string[]" | "any[]" | ValidationSchema;
} | {
    oneOf: readonly any[];
});
export declare type OneOfTypes = BaseOptions & {
    oneOfTypes: readonly ValidationSchema[];
};
declare type FieldType = SimpleType | OneOfTypes;
declare type GetType<T extends FieldType> = T extends {
    type: ValidationSchema;
} ? SchemaObject<T["type"]> : T extends {
    type: "number";
} ? number : T extends {
    type: "boolean";
} ? boolean : T extends {
    type: "integer";
} ? number : T extends {
    type: "string";
} ? string : T extends {
    type: "any";
} ? any : T extends {
    type: "number[]";
} ? number[] : T extends {
    type: "boolean[]";
} ? boolean[] : T extends {
    type: "integer[]";
} ? number[] : T extends {
    type: "string[]";
} ? string[] : T extends {
    type: "any[]";
} ? any[] : T extends {
    oneOf: readonly any[];
} ? T["oneOf"][number] : 
/** This needs fixing */
T extends {
    oneOfTypes: readonly ValidationSchema[];
} ? SchemaObject<T["oneOfTypes"][number]> : any;
export declare type ValidationSchema = Record<string, FieldType>;
export declare type SchemaObject<S extends ValidationSchema> = ({
    [K in keyof S as S[K]["optional"] extends true ? K : never]?: GetType<S[K]>;
} & {
    [K in keyof S as S[K]["optional"] extends true ? never : K]: GetType<S[K]>;
});
export declare function validate<T>(obj: T, key: keyof T, validation: FieldType): boolean;
export declare function validateSchema<S extends ValidationSchema>(schema: S, obj: SchemaObject<S>, objName?: string, optional?: boolean): void;
export declare function getPGCheckConstraint(args: {
    escapedFieldName: string;
    schema: ValidationSchema | OneOfTypes;
    nullable: boolean;
    isRootQuery?: boolean;
    optional?: boolean;
}, depth: number): string;
declare type ColOpts = {
    nullable?: boolean;
};
export declare function getSchemaTSTypes(schema: ValidationSchema, leading?: string, isOneOf?: boolean): string;
export declare function getJSONBSchemaTSTypes(schema: ValidationSchema | OneOfTypes, colOpts: ColOpts, leading?: string, isOneOf?: boolean): string;
export declare function getJSONBSchemaAsJSONSchema(tableName: string, columnConfig: BaseColumn<{
    en: 1;
}> & JSONBColumnDef): AnyObject;
export {};
//# sourceMappingURL=validation.d.ts.map