// Runtime Obsidian module is supplied by the host. Individual tests mock its APIs.
export const Platform = { isDesktopApp: true, isMobile: false };

let requestHandler: (options: Record<string, unknown>) => Promise<unknown> = async () => { throw new Error("requestUrl was not configured for this test"); };
export function setRequestUrlHandler(handler: typeof requestHandler): void { requestHandler = handler; }
export function requestUrl(options: Record<string, unknown>): Promise<unknown> { return requestHandler(options); }
