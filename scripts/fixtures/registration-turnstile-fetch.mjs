// Loaded only by test-registration-http's child process via Node --import.
// Inject Siteverify's transport response without any application bypass or network call.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    const body = JSON.parse(init?.body ?? "{}");
    return Response.json({ success: body.response === "ms21-http-pass" });
  }
  return originalFetch(input, init);
};
