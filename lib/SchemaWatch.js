"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaWatch = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
class SchemaWatch {
    schema_checkIntervalMillis;
    loaded = false;
    constructor({ watchSchema, watchSchemaType, tsGeneratedTypesDir, currDbuilder, onSchemaChanged }) {
        if (!watchSchema)
            return;
        if (watchSchema === "hotReloadMode" && !tsGeneratedTypesDir) {
            throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
        }
        else if ((0, prostgles_types_1.isObject)(watchSchemaType) &&
            "checkIntervalMillis" in watchSchemaType &&
            typeof watchSchemaType.checkIntervalMillis === "number") {
            if (this.schema_checkIntervalMillis) {
                clearInterval(this.schema_checkIntervalMillis);
            }
            this.schema_checkIntervalMillis = setInterval(async () => {
                if (!this.loaded)
                    return;
                const dbuilder = await DboBuilder_1.DboBuilder.create(this);
                if (dbuilder.tsTypesDefinition !== currDbuilder.tsTypesDefinition) {
                    onSchemaChanged();
                }
            }, watchSchemaType.checkIntervalMillis);
        }
        else if (watchSchemaType === "DDL_trigger") {
        }
    }
}
exports.SchemaWatch = SchemaWatch;
