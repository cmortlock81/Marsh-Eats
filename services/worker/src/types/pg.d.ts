declare module "pg" {
  // Database drivers expose dynamic row shapes; callers narrow per-query where needed.
  export interface QueryResult<Row = any> { rows: Row[]; rowCount: number | null; }
  export interface PoolClient {
    query<Row = any>(text: string, values?: readonly any[]): Promise<QueryResult<Row>>;
    release(): void;
    on(event: "notification", listener: (message: { payload?: string }) => void): this;
    off(event: "notification", listener: (message: { payload?: string }) => void): this;
  }
  export class Pool {
    constructor(config?: { connectionString?: string; max?: number });
    query<Row = any>(text: string, values?: readonly any[]): Promise<QueryResult<Row>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
  const pg: { Pool: typeof Pool };
  export default pg;
}
