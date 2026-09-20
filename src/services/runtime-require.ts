interface RuntimeRequireContainer {
  require?: (id: string) => unknown;
}

export function getRuntimeRequire(): ((id: string) => unknown) | null {
  if (typeof window === "undefined") return null;
  const container = window as unknown as RuntimeRequireContainer;
  return typeof container.require === "function" ? container.require : null;
}
