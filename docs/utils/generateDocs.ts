import { generateServerDocs } from "./generateServerDocs";
import { generateClientDocs } from "./generateClientDocs";

(async () => {
  await generateServerDocs();
  await generateClientDocs(3);
})();
