export function resolveOverTypeBrowserExports(browserGlobal) {
  const OverTypeEditor = browserGlobal?.OverType;
  const toolbarButtons = browserGlobal?.toolbarButtons;
  if (typeof OverTypeEditor !== "function" || !toolbarButtons || typeof toolbarButtons !== "object") {
    throw new Error("OverType 2.9.0 did not initialize.");
  }
  return { OverTypeEditor, toolbarButtons };
}
