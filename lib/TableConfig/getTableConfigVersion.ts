export const getTableConfigVersion = (value: string | null | undefined) => {
  if (value === null || value === undefined) return;

  const version = Number(value);
  return Number.isFinite(version) ? version : undefined;
};
