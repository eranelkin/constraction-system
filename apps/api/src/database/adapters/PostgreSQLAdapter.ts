import pg from 'pg';
import type { IDatabase, QueryResult } from '../DatabaseProvider.js';

const { Pool } = pg;

type Row = pg.QueryResultRow;

export class PostgreSQLAdapter implements IDatabase {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T & Row>(sql, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null> {
    const result = await this.pool.query<T & Row>(sql, params);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async transaction<T>(fn: (db: IDatabase) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transactionalDb: IDatabase = {
        query: async <R = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ): Promise<QueryResult<R>> => {
          const r = await client.query<R & Row>(sql, params);
          return { rows: r.rows as R[], rowCount: r.rowCount ?? 0 };
        },
        queryOne: async <R = Record<string, unknown>>(
          sql: string,
          params?: unknown[],
        ): Promise<R | null> => {
          const r = await client.query<R & Row>(sql, params);
          return (r.rows[0] as R | undefined) ?? null;
        },
        transaction: (innerFn) => innerFn(transactionalDb),
        close: async () => {},
      };
      const result = await fn(transactionalDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
