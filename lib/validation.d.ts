declare type FieldType = ({
    type: "number" | "boolean" | "integer" | "string" | "number[]" | "boolean[]" | "integer[]" | "string[]" | ValidationSchema;
} | {
    oneOf: readonly any[];
} | {
    oneOfTypes: readonly ValidationSchema[];
}) & {
    optional?: boolean;
    nullable?: boolean;
};
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
    type: "number[]";
} ? number[] : T extends {
    type: "boolean[]";
} ? boolean[] : T extends {
    type: "integer[]";
} ? number[] : T extends {
    type: "string[]";
} ? string[] : T extends {
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
    schema: ValidationSchema;
}): string;
export declare function getSchemaTSTypes(schema: ValidationSchema, leading?: string, isOneOf?: boolean): string;
export {};
//# sourceMappingURL=validation.d.ts.map