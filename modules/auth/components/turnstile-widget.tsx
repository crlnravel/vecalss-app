"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      "response-field": boolean;
      sitekey: string;
      theme: "light";
    },
  ) => string;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare's script. The CSP in next.config.ts allows exactly this origin. */
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * The Turnstile check on a form. Rendered explicitly rather than by scanning the
 * page for a marked element: the scan only runs when the script first loads, so a
 * visitor who reaches the form by following a link inside the app would get no
 * widget. The token goes into the hidden field "cf-turnstile-response", which the
 * server action reads. A token works once, so a change in `resetOn` (the form
 * state, which is new after every answer from the server) asks for a fresh one.
 */
function TurnstileWidget({ resetOn, siteKey }: { resetOn: unknown; siteKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const firstRun = useRef(true);
  const [token, setToken] = useState("");

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    if (!window.turnstile || !container || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(container, {
      callback: (value) => setToken(value),
      "error-callback": () => setToken(""),
      "expired-callback": () => setToken(""),
      "response-field": false,
      sitekey: siteKey,
      theme: "light",
    });
  }, [siteKey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (window.turnstile && widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
    setToken("");
  }, [resetOn]);

  return (
    <div>
      <Script onReady={renderWidget} src={TURNSTILE_SCRIPT} strategy="afterInteractive" />
      <div className="min-h-[65px]" ref={containerRef} />
      <input name="cf-turnstile-response" type="hidden" value={token} />
    </div>
  );
}

export { TurnstileWidget };
