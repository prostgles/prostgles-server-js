import {
  getSerializableType,
  TS_Object,
  TsTypeParser,
} from "./getSerializableType";

/**
 * A & B
 */
export const getSerializableIntersection: TsTypeParser = ({
  myType,
  nextUnresolvedParentAliases,
  checker,
  visited,
  depth,
  opts,
}) => {
  if (myType.isIntersection()) {
    const { escapedName } = myType.aliasSymbol ?? {};
    const aliasSymbolescapedName = escapedName?.toString();

    const intersectionTypes = myType.types.map((t) => {
      const { resolvedType: intersectionType } = getSerializableType({
        myType: t,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      });

      if (intersectionType.type === "object") {
        intersectionType.intersectionParent = aliasSymbolescapedName;
      }
      return intersectionType;
    });
    if (intersectionTypes.every((t) => t.type === "object")) {
      const properties = (intersectionTypes as TS_Object[]).reduce((acc, t) => {
        const propertiesWithParentObject = Object.entries(t.properties).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: { ...v, intersectionParent: t.aliasSymbolescapedName },
          }),
          {},
        );
        return { ...acc, ...propertiesWithParentObject };
      }, {});
      return {
        type: "object",
        properties,
      };
    }
    return {
      type: "intersection",
      types: intersectionTypes,
    };
  }
};
