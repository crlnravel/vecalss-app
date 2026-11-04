import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request carries the shared secret of the two-API scalability
 * simulation. Missing or differently sized values are refused first, because
 * timingSafeEqual needs equal lengths; equal-length values are compared in
 * constant time so repeated guesses learn nothing from response timing.
 */
function hasSimulationSecret(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const expected = env.SCALABILITY_SIMULATION_SECRET;
  const presented = request.headers.get("x-scalability-secret");
  if (!expected || !presented) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const presentedBytes = Buffer.from(presented, "utf8");
  return expectedBytes.length === presentedBytes.length && timingSafeEqual(presentedBytes, expectedBytes);
}

export { hasSimulationSecret };
