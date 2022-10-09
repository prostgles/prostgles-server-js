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
    enum: readonly any[];
});
export declare type OneOf = BaseOptions & {
    oneOf: readonly ValidationSchema[];
};
declare type FieldType = SimpleType | OneOf;
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
    enum: readonly any[];
} ? T["enum"][number] : 
/** This needs fixing */
T extends {
    oneOf: readonly ValidationSchema[];
} ? SchemaObject<T["oneOf"][number]> : any;
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
    schema: ValidationSchema | OneOf;
    nullable: boolean;
    isRootQuery?: boolean;
    optional?: boolean;
}, depth: number): string;
declare type ColOpts = {
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
    export type Object = Base & {
        type: "object";
        properties: Record<string, Schema>;
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
        oneOf: (Object | Enum | Array | Any)[];
    };
    export type Schema = Any | Object | Enum | Array | OneOf;
    export {};
}
declare type JSONSchema = JSTypes.Schema;
export declare function getJSONBSchemaAsJSONSchema(tableName: string, colName: string, columnConfig: BaseColumn<{
    en: 1;
}> & JSONBColumnDef): JSONSchema;
export {};
//# sourceMappingURL=validation.d.ts.map