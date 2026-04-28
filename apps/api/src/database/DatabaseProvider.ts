export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface IDatabase {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;

  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;

  transaction<T>(fn: (db: IDatabase) => Promise<T>): Promise<T>;

  close(): Promise<void>;
}
