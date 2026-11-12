import { expect, test } from "bun:test"
import { newerBuild } from "./useFreshBuild"

const page = (src: string) => `<!doctype html><head><script type="module" crossorigin src="${src}"></script></head>`

test("a new deploy is seen only when our page names another build file", () => {
  expect(newerBuild(page("/assets/index-NEW_b-2.js"), "/assets/index-OLD.js")).toBe("/assets/index-NEW_b-2.js")
  expect(newerBuild(page("/assets/index-OLD.js"), "/assets/index-OLD.js")).toBeNull()
  expect(newerBuild("<html>Wi-Fi login</html>", "/assets/index-OLD.js")).toBeNull()   // a captive portal, an error page
})
