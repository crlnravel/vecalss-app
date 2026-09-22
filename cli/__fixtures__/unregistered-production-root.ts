// Negative fixture: a future package-launched root must be added to the
// production manifest before it can become a production writer boundary.
export async function futureProductionEntrypoint() {
  return "unregistered";
}
