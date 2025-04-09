import path from "path";
import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBGeneratedSchema";

prostgles<DBGeneratedSchema>({
  dbConnection: {
    connectionString: process.env.DB_CONNECTION,
  },
  tsGeneratedTypesDir: path.join(__dirname + "/"),
  tableConfig: {
    user: {
      columns: {
        id: "SERIAL PRIMARY KEY",
        email: "TEXT NOT NULL",
        status: { enum: ["active", "disabled", "pending"] },
        preferences: {
          jsonbSchemaType: {
            showIntro: { type: "boolean", optional: true },
            theme: { enum: ["light", "dark", "auto"], optional: true },
            two_factor_auth: { oneOf: [{ enum: ["app"] }] },
          },
        },
      },
    },
  },
  onReady: async ({ dbo }) => {
    const user = await dbo.users.findOne({ id: 123 });

    user?.preferences.theme === "dark";
    //@ts-expect-error
    user?.status === "actived";
  },
});
