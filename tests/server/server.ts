
import path from 'path';
import prostgles from "prostgles-server";
import { DBSchemaGenerated } from "./DBoGenerated";

prostgles<DBSchemaGenerated>({
  dbConnection: {
    connectionString: process.env.DB_CONNECTION
  },
  tsGeneratedTypesDir: path.join(__dirname + '/'),
  tableConfig: {
    user: {
      columns: {
        id: { sqlDefinition: `SERIAL PRIMARY KEY ` },
        email: { sqlDefinition: `TEXT NOT NULL` },
        status: { enum: ["active", "disabled", "pending"] },
        preferences: {
          defaultValue: "{}",
          jsonbSchema: {
            showIntro: { type: "boolean", optional: true },
            theme: { enum: ["light", "dark"], optional: true },
          }
        },
      }
    }
  },
  onReady: async (db) => {
    const user = await db.users.findOne({ id: 123 });
    // user.preferences.theme === ""
  }
});