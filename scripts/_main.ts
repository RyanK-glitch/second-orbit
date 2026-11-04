import { pathToFileURL } from "node:url";

/** True when the importing module is the script being run (paths with spaces are URL-encoded). */
export const isMain = (moduleUrl: string) => !!process.argv[1] && moduleUrl === pathToFileURL(process.argv[1]).href;
