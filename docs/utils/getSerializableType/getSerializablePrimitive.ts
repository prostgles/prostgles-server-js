import * as ts from "typescript";
import { TsTypeParser } from "./getSerializableType";

export const getSerializablePrimitive: TsTypeParser = ({ myType }) => {
  if ((myType.flags & ts.TypeFlags.String) !== 0) {
    return { type: "primitive", subType: "string" };
  }

  if ((myType.flags & ts.TypeFlags.NumberLike) !== 0) {
    return { type: "primitive", subType: "number" };
  }

  if ((myType.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return { type: "primitive", subType: "boolean" };
  }

  if ((myType.flags & ts.TypeFlags.Null) !== 0) {
    return { type: "primitive", subType: "null" };
  }

  if ((myType.flags & ts.TypeFlags.Undefined) !== 0) {
    return { type: "primitive", subType: "undefined" };
  }
};
