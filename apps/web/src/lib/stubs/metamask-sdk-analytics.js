// No-op stub — suppresses @metamask/sdk-analytics telemetry in browser.
// Proxy catches any method the SDK calls (send, flush, track, identify,
// setGlobalProperty, etc.) and silently ignores them.
const analytics = new Proxy(
  {},
  { get: () => () => {} }
);
module.exports = { analytics };
