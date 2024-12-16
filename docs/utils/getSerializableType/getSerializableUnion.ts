import {
  getSerializableType,
  TS_Union,
  TsTypeParser,
} from "./getSerializableType";

export const getSerializableUnion: TsTypeParser = ({
  myType,
  opts,
  checker,
  visited,
  depth,
  nextUnresolvedParentAliases,
}) => {
  if (myType.isUnion()) {
    let unionMembers = myType.types;
    /**
     * myType.types tends to unnest unions into bigger unions.
     * myType.origin is the original union which we want to keep for brevity.
     */
    if (
      "origin" in myType &&
      myType.origin &&
      (myType.origin as any).isUnion()
    ) {
      unionMembers = (myType.origin as any).types;
    }
    const unionTypes = unionMembers.map((t) => {
      const resolvedUnionMember = getSerializableType({
        myType: t,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      });
      return resolvedUnionMember.resolvedType;
    });

    /**
     * "boolean | undefined" ends up in types as
     * { intrinsicName: "true" } | { intrinsicName: "false" } | { intrinsicName: "undefined" }
     * So we need to check for "true" and "false" and merge them into "boolean"
     */
    const booleanTypes = unionTypes.filter(
      (t) => t.type === "primitive" && t.subType === "boolean",
    );
    const dedupedTypes =
      booleanTypes.length > 1
        ? unionTypes
            .filter((t) => t.type !== "primitive" || t.subType !== "boolean")
            .concat(booleanTypes[0]!)
        : unionTypes;

    const result: TS_Union = {
      type: "union",
      types: dedupedTypes,
    };

    return result;
  }
};
