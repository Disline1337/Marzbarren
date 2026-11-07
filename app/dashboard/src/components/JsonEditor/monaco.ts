import "./monaco-env";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/json/jsonMode";
import "monaco-editor/min/vs/editor/editor.main.css";
import xraySchema from "./xray-schema.json";

export const XRAY_CONFIG_URI = monaco.Uri.parse("inmemory://xray-config.json");

monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  trailingCommas: "error",
  enableSchemaRequest: false,
  schemaValidation: "warning",
  schemas: [
    {
      uri: "inmemory://xray-schema.json",
      fileMatch: ["*", "*.json", "xray-config.json"],
      schema: xraySchema,
    },
  ],
});

export { monaco };
