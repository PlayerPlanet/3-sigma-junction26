import { DEFAULT_CONTENT_DIR, loadContent } from "../node/loadContent";

/** Test helper: the repo's content, loaded the same way the server loads it. */
export const content = loadContent(DEFAULT_CONTENT_DIR);
export const loadTypes = () => content.types;
export const loadDefaultLayout = () => content.layouts.default!;
