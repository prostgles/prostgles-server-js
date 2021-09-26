"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXISTS_KEYS = exports.GeomFilter_Funcs = exports.GeomFilterKeys = exports.TextFilterFTSKeys = exports.TextFilter_FullTextSearchFilterKeys = exports.CompareInFilterKeys = exports.CompareFilterKeys = void 0;
exports.CompareFilterKeys = ["=", "$eq", "<>", ">", ">=", "<=", "$eq", "$ne", "$gt", "$gte", "$lte"];
exports.CompareInFilterKeys = ["$in", "$nin"];
exports.TextFilter_FullTextSearchFilterKeys = ["to_tsquery", "plainto_tsquery", "phraseto_tsquery", "websearch_to_tsquery"];
exports.TextFilterFTSKeys = ["@@", "@>", "<@", "$contains", "$containedBy"];
exports.GeomFilterKeys = ["~", "~=", "@", "|&>", "|>>", ">>", "=", "<<|", "<<", "&>", "&<|", "&<", "&&&", "&&"];
exports.GeomFilter_Funcs = ["ST_MakeEnvelope", "ST_MakeEnvelope".toLowerCase()];
exports.EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
//# sourceMappingURL=filters.js.map