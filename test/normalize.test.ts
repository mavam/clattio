import { describe, expect, it } from "vitest";

import {
  applySyntheticOperationIds,
  normalizeSpec,
  synthesizeSdkFunctionName,
} from "../src/codegen/normalize";

describe("normalizeSpec", () => {
  it("derives stable SDK function names from method and path", () => {
    expect(
      synthesizeSdkFunctionName(
        "get",
        "/v2/objects/{object}/records/{record_id}",
      ),
    ).toBe("getV2ObjectsByObjectRecordsByRecordId");
  });

  it("uses patched operationIds as the SDK function source of truth", () => {
    const spec = {
      paths: {
        "/v2/objects/{object}/records/{record_id}": {
          get: {
            summary: "Get a record",
            tags: ["Records"],
          },
        },
      },
    };

    applySyntheticOperationIds(spec);

    expect(normalizeSpec(spec)[0]?.sdkFunction).toBe(
      "getV2ObjectsByObjectRecordsByRecordId",
    );
  });

  it("disambiguates duplicate action names within a tag", () => {
    const manifest = normalizeSpec({
      paths: {
        "/v1/records/{record_id}": {
          patch: {
            summary: "Update a record (append multiselect values)",
            tags: ["Records"],
          },
          put: {
            summary: "Update a record (overwrite multiselect values)",
            tags: ["Records"],
          },
        },
      },
    });

    expect(manifest.map((entry) => entry.commandName)).toEqual([
      "update-append-multiselect-values",
      "update-overwrite-multiselect-values",
    ]);
  });
});
