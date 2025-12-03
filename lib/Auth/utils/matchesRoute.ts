export const matchesRoute = (baseRoute: string, fullRoute: string) => {
  if (!baseRoute || !fullRoute) return false;
  if (baseRoute === fullRoute) return true;
  const nextChar = fullRoute[baseRoute.length] ?? "";
  return fullRoute.startsWith(baseRoute) && ["/", "?", "#"].includes(nextChar);
};
