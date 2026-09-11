import { validateClientSchemaName } from "../DBSchemaBuilder/getClientDBGeneratedSchemas";
import type { PublishProfile } from "./publishTypesAndUtils";

export const validatePublishProfiles = (profiles: PublishProfile[]) => {
  const names = new Set<string>();
  const userTypes = new Set<string>();
  const entries = profiles.map((profile, index) => {
    const name = profile.name ?? `Publish${index + 1}Schema`;
    validateClientSchemaName(name);
    if (names.has(name)) throw new Error(`Duplicate publish schema name: ${name}`);
    names.add(name);
    if (!profile.userTypes.length) {
      throw new Error(`Publish ${name}: userTypes must not be empty`);
    }
    for (const userType of profile.userTypes) {
      if (userTypes.has(userType)) throw new Error(`Duplicate publish user type: ${userType}`);
      userTypes.add(userType);
    }
    return { ...profile, name };
  });
  return entries;
};
