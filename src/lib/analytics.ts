import { site } from "@/lib/site";

// anonymous usage stats (posthog, eu cloud). the script only starts on the production
// hostname, so dev, previews and forks of this repo send nothing. requests go through
// /ingest on our own domain (a rewrite in vercel.json) so ad blockers don't drop them.

const POSTHOG_KEY = "phc_AS8u4MVwjJwZCstaqu2QSFdCZZpR7nQYTwQCaisBYAcy";
const host = new URL(site.url).hostname;

/** posthog's loader snippet, inlined after hydration by the root layout */
export const posthogScript = `if(location.hostname===${JSON.stringify(host)}){
!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="gu mu yu bu ku init Qu Zu Wu Vu Yu el Gu ec zu lc uc cc hc dc vc capture getExtension Ju fu mc calculateEventProperties gc register register_once register_for_session unregister unregister_for_session wc Uu yc getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys onActiveMatchingSurveysChanged renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync kc identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset Sc shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty bc rc createPersonProfile setInternalOrTestUser Cu xu opt_in_capturing opt_out_capturing $u has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing nc debug il Os getPageViewId captureTraceFeedback captureTraceMetric Nu".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(POSTHOG_KEY)},{api_host:"/ingest",ui_host:"https://eu.posthog.com",defaults:"2026-05-30",person_profiles:"identified_only"});
}`;

// the event list (and what each one carries) is in docs/analytics.md. keep it short: names are
// snake_case verbs in the past tense, props are small enums and counts. never the sql someone
// typed, never what they searched for, never anything about who they are.

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Props) => void };
  }
}

/** part and chapter from /learn/<part>/<chapter>, so every event says where it happened */
function where(): Props {
  const m = /^\/learn\/([^/]+)(?:\/([^/]+))?/.exec(location.pathname);
  return m ? { part: m[1], chapter: m[2] } : {};
}

/** one product event. a no-op on the server and wherever posthog isn't loaded (dev, previews, blocked). never throws */
export function track(event: string, props?: Props) {
  try {
    if (typeof window === "undefined" || typeof window.posthog?.capture !== "function") return;
    window.posthog.capture(event, { ...where(), ...props });
  } catch {}
}

/** a duration as a coarse bucket, so the numbers group */
export function msBucket(ms: number): string {
  if (!Number.isFinite(ms)) return "unknown";
  if (ms < 100) return "<100ms";
  if (ms < 500) return "100-500ms";
  if (ms < 2000) return "0.5-2s";
  if (ms < 10000) return "2-10s";
  return ">10s";
}

/** 1-based position of el among the page's elements matching selector (a stable-ish "which one") */
export function nth(el: Element | null, selector: string): number | undefined {
  try {
    if (!el) return undefined;
    const i = Array.from(document.querySelectorAll(selector)).indexOf(el);
    return i >= 0 ? i + 1 : undefined;
  } catch {
    return undefined;
  }
}

/* ---- figures ------------------------------------------------------------- */

const touched = new WeakSet<Element>();
const ACTIVE = "button, input, select, textarea, a, label, [role], [tabindex], svg";
const STEP_KEYS = new Set(["ArrowRight", "ArrowLeft", " ", "Home", "End", "Enter"]);

/**
 * fire figure_interacted the first time someone clicks, drags or keys inside this figure.
 * once per figure per page view; both <Figure> and useStepper call it, a figure counts once.
 * returns the cleanup.
 */
export function watchFigure(el: Element | null): () => void {
  if (!el) return () => {};
  const root = el.closest("figure") ?? el;
  const fire = (e: Event) => {
    try {
      if (touched.has(root)) return off();
      if (e.type === "click" && !(e.target as Element | null)?.closest?.(ACTIVE)) return;
      if (e.type === "keydown" && !STEP_KEYS.has((e as KeyboardEvent).key)) return;
      touched.add(root);
      off();
      const isFigure = root.tagName === "FIGURE";
      track("figure_interacted", {
        figure: isFigure ? nth(root, "figure") : nth(root, "[data-stepper]"),
        stepper: !!(root.matches("[data-stepper]") || root.querySelector("[data-stepper]")),
        via: e.type === "keydown" ? "key" : e.type === "click" ? "click" : "input",
      });
    } catch {}
  };
  const types = ["click", "input", "keydown"] as const;
  const off = () => types.forEach((t) => el.removeEventListener(t, fire, true));
  if (touched.has(root)) return () => {};
  types.forEach((t) => el.addEventListener(t, fire, true));
  return off;
}

/* ---- outbound links ------------------------------------------------------ */

/** one document listener: clicks on links that leave the site. host + path only, no query */
export function watchOutbound(): () => void {
  const on = (e: MouseEvent) => {
    try {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const u = new URL(a.href, location.href);
      if (!/^https?:$/.test(u.protocol) || u.host === location.host) return;
      track("outbound_clicked", { host: u.host, url: `${u.origin}${u.pathname}`.slice(0, 200) });
    } catch {}
  };
  document.addEventListener("click", on, true);
  document.addEventListener("auxclick", on, true);
  return () => {
    document.removeEventListener("click", on, true);
    document.removeEventListener("auxclick", on, true);
  };
}
