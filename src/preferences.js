export async function fetchBudgetDateFormat(actualApi) {
  const preferences = await actualApi.internal.send("preferences/get");
  const value = preferences?.dateFormat;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
