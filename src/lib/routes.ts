// Minimal path-based routing. No router library: the app has only a handful of
// entry URLs (mostly links from emails), so a pathname match is enough. Add a
// new page by adding a case to `Route` and a pattern below.

export type Route =
  // Email link to a request's read-only status page: /r/:requestId?t=:token
  | { name: "request"; requestId: string; token: string | null }
  // Hose audit report from the customer's email: /a/:auditId?t=:token
  | { name: "audit"; auditId: string; token: string | null }
  // Supplier email links open the app on the supplier side: /supplier, or
  // straight to an enquiry: /supplier/enquiries[/:id]
  | { name: "supplier"; tab?: "enquiries"; enquiryId?: string | null }
  // Customer email link to an enquiry thread: /enquiries[/:id]
  | { name: "enquiries"; enquiryId: string | null }
  // Customer email links straight to their maintenance register / requests
  | { name: "machines" }
  | { name: "requests" }
  // Everything else is the main customer app.
  | { name: "home" };

export function matchRoute(pathname: string, search = ""): Route {
  const request = pathname.match(/^\/r\/([^/]+)\/?$/);
  if (request) {
    return {
      name: "request",
      requestId: decodeURIComponent(request[1]),
      token: new URLSearchParams(search).get("t"),
    };
  }
  const audit = pathname.match(/^\/a\/([^/]+)\/?$/);
  if (audit) {
    return { name: "audit", auditId: decodeURIComponent(audit[1]), token: new URLSearchParams(search).get("t") };
  }
  const supplierEnquiry = pathname.match(/^\/supplier\/enquiries(?:\/([^/]+))?\/?$/);
  if (supplierEnquiry) {
    return { name: "supplier", tab: "enquiries", enquiryId: supplierEnquiry[1] ? decodeURIComponent(supplierEnquiry[1]) : null };
  }
  if (/^\/supplier\/?$/.test(pathname)) return { name: "supplier" };
  const enquiry = pathname.match(/^\/enquiries(?:\/([^/]+))?\/?$/);
  if (enquiry) return { name: "enquiries", enquiryId: enquiry[1] ? decodeURIComponent(enquiry[1]) : null };
  if (/^\/machines\/?$/.test(pathname)) return { name: "machines" };
  if (/^\/requests\/?$/.test(pathname)) return { name: "requests" };
  return { name: "home" };
}

export function currentRoute(): Route {
  if (typeof window === "undefined") return { name: "home" };
  return matchRoute(window.location.pathname, window.location.search);
}
