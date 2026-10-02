import type { JSONB } from "prostgles-types";

export const getFileBuffer = async (
  data: JSONB.GetType<typeof FILE_DATA_SCHEMA>,
): Promise<Buffer> => {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer());

  if (!Array.isArray(data) && "encoding" in data) {
    const buffer = Buffer.from(data.data, "base64");
    const encoded = buffer.toString("base64");
    if (data.data !== encoded && data.data !== encoded.replace(/=+$/, "")) {
      throw new Error(
        '"data.data" must be canonical standard base64, with correct "=" padding or no padding ' +
        '(e.g. "YQ==" or "YQ"). Whitespace, base64url characters ("-" and "_"), ' +
        'and data URL prefixes are not accepted.',
      );
    }
    return buffer;
  }

  const bytes = Array.isArray(data) ? data : data.data;
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error("File data bytes must be integers between 0 and 255");
  }
  return Buffer.from(bytes);
};

export const FILE_DATA_SCHEMA = {
  oneOf: [
    "Blob",
    "integer[]",
    { type: { type: { enum: ["Buffer"] }, data: "integer[]" } },
    { type: { encoding: { enum: ["base64"] }, data: "string" } },
  ],
} as const;
