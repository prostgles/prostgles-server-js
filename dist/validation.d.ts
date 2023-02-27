import { AnyObject } from "prostgles-types";
import { BaseColumn, JSONBColumnDef, StrictUnion } from "./TableConfig";
type BaseOptions = {
    /**
     * False by default
     */
    optional?: boolean;
    /**
     * False by default
     */
    nullable?: boolean;
    description?: string;
    allowedValues?: any[];
    title?: string;
};
declare const DATA_TYPES: readonly ["boolean", "number", "integer", "string", "any", ...("string[]" | "number[]" | "boolean[]" | "integer[]" | "any[]")[]];
type DataType = typeof DATA_TYPES[number];
export type OneOf = BaseOptions & {
    type?: undefined;
    oneOf: readonly ValidationSchema[];
    arrayOf?: undefined;
    enum?: undefined;
};
export type ArrayOf = BaseOptions & {
    type?: undefined;
    arrayOf: ValidationSchema;
    oneOf?: undefined;
    enum?: undefined;
};
type FieldTypeObj = BaseOptions & ({
    type: DataType | ValidationSchema;
    oneOf?: undefined;
    arrayOf?: undefined;
    enum?: undefined;
} | {
    type?: undefined;
    enum: readonly any[];
    oneOf?: undefined;
    arrayOf?: undefined;
} | OneOf | ArrayOf);
type FieldType = DataType | FieldTypeObj;
type GetType<T extends FieldType> = T extends {
    type: ValidationSchema;
} ? SchemaObject<T["type"]> : T extends "number" | {
    type: "number";
} ? number : T extends "boolean" | {
    type: "boolean";
} ? boolean : T extends "integer" | {
    type: "integer";
} ? number : T extends "string" | {
    type: "string";
} ? string : T extends "any" | {
    type: "any";
} ? any : T extends "number[]" | {
    type: "number[]";
} ? number[] : T extends "boolean[]" | {
    type: "boolean[]";
} ? boolean[] : T extends "integer[]" | {
    type: "integer[]";
} ? number[] : T extends "string[]" | {
    type: "string[]";
} ? string[] : T extends "any[]" | {
    type: "any[]";
} ? any[] : T extends {
    enum: readonly any[];
} ? T["enum"][number] : T extends {
    oneOf: readonly ValidationSchema[];
} ? StrictUnion<SchemaObject<T["oneOf"][number]>> : T extends {
    arrayOf: ValidationSchema;
} ? SchemaObject<T["arrayOf"]>[] : any;
type IsOptional<F extends FieldType> = F extends DataType ? false : F extends {
    optional: true;
} ? true : false;
export type ValidationSchema = Record<string, FieldType>;
export type SchemaObject<S extends ValidationSchema> = ({
    [K in keyof S as IsOptional<S[K]> extends true ? K : never]?: GetType<S[K]>;
} & {
    [K in keyof S as IsOptional<S[K]> extends true ? never : K]: GetType<S[K]>;
});
export declare function validate<T>(obj: T, key: keyof T, rawFieldType: FieldType): boolean;
export declare function validateSchema<S extends ValidationSchema>(schema: S, obj: SchemaObject<S>, objName?: string, optional?: boolean): void;
export declare function getPGCheckConstraint(args: {
    escapedFieldName: string;
    schema: ValidationSchema | OneOf;
    nullable: boolean;
    isRootQuery?: boolean;
    optional?: boolean;
}, depth: number): string;
type ColOpts = {
    nullable?: boolean;
};
export declare function getSchemaTSTypes(schema: ValidationSchema, leading?: string, isOneOf?: boolean): string;
export declare function getJSONBSchemaTSTypes(schema: ValidationSchema | OneOf, colOpts: ColOpts, leading?: string, isOneOf?: boolean): string;
declare namespace JSTypes {
    type Base = {
        $id?: string;
        $schema?: string;
        title?: string;
        description?: string;
        required?: boolean;
    };
    export type Any = {};
    export type Object<T extends AnyObject = AnyObject> = Base & {
        type: "object";
        properties: Record<keyof T, Schema>;
    };
    export type Enum = Base & {
        type: "string" | "number";
        enum: (string | number)[];
    };
    export type Array = Base & {
        type: "array";
        items: (string | number)[];
    };
    export type OneOf = {
        oneOf: (Any | Object | Enum | Array)[];
    };
    export type Schema = Any | Object | Enum | Array | OneOf;
    export {};
}
type JSONSchema = JSTypes.Schema;
export declare function getJSONBSchemaAsJSONSchema(tableName: string, colName: string, columnConfig: BaseColumn<{
    en: 1;
}> & JSONBColumnDef): JSONSchema;
export {};
//# sourceMappingURL=validation.d.ts.map