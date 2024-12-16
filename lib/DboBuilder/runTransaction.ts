import * as pg from "pg";
const { Client } = pg;

export type PGTX = (query: pg.Client["query"]) => Promise<void>;
export type RunTransactionOpts = {
  begin?: boolean;
  onSuccess: "COMMIT" | "ROLLBACK" | undefined;
};
export const runClientTransaction = async (
  handler: PGTX,
  { onSuccess, begin = true }: RunTransactionOpts,
  dbConn: pg.ClientConfig,
) => {
  const client = new Client(dbConn);
  try {
    if (begin) {
      await client.query("BEGIN");
    }
    await handler(client.query);
    if (onSuccess) {
      await client.query(onSuccess);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.end();
  }
};

export const runClientTransactionStatement = async (
  statement: string,
  dbConn: pg.ClientConfig,
) => {
  return runClientTransaction(
    async (query) => {
      await query(statement);
    },
    { onSuccess: undefined, begin: false },
    dbConn,
  );
};

// let pool: pg.Pool | undefined;
// export const runPoolTransaction = async (handler: PGTX, { onSuccess, begin = true }: RunTransactionOpts, dbConn: pg.ClientConfig) => {
//   pool ??= new Pool(dbConn);
//   const client = await pool.connect()

//   try {
//     await client.query('BEGIN')
//     await handler(client.query);
//     if(onSuccess){
//       await client.query(onSuccess);
//     }
//   } catch (e) {
//     await client.query('ROLLBACK');
//     throw e
//   } finally {
//     client.release();
//   }
// }
