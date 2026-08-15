export interface Configuration {
  readonly httpPort: number;
  readonly databaseUrl: string;
  readonly storageDirectory: string;
}

export function loadConfiguration(): Configuration {
  return {
    httpPort: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgresql://depawn:depawn@localhost:5433/depawn',
    storageDirectory: process.env.STORAGE_DIRECTORY ?? 'var/storage',
  };
}
