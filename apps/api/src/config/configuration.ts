import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig, int } from '@erp/config';

export interface JwtSettings {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface StorageSettings {
  driver: 'local' | 's3';
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  localDir: string;
}

export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  databaseUrl: string;
  redisUrl: string;
  corsOrigins: string[];
  swagger: { enabled: boolean };
  jwt: JwtSettings;
  storage: StorageSettings;
}

const DEV_DEFAULTS = {
  accessSecret: 'change-me-access-dev',
  accessExpiresIn: '15m',
  refreshSecret: 'change-me-refresh-dev',
  refreshExpiresIn: '7d',
};

@Injectable()
export class Configuration {
  static register(config: ConfigService): AppConfiguration {
    const nodeEnv = config.get<string>('NODE_ENV', 'development');
    const corsOrigins = config
      .get<string>('CORS_ORIGINS', '*')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return {
      nodeEnv,
      port: int(config.get<string>('PORT'), 3000),
      apiPrefix: config.get<string>('API_PREFIX', '/api/v1'),
      databaseUrl: config.get<string>('DATABASE_URL', ''),
      redisUrl: config.get<string>('REDIS_URL', ''),
      corsOrigins,
      swagger: { enabled: config.get<string>('SWAGGER_ENABLED', 'true') === 'true' },
      jwt: {
        accessSecret: config.get<string>('JWT_ACCESS_SECRET', DEV_DEFAULTS.accessSecret),
        accessExpiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', DEV_DEFAULTS.accessExpiresIn),
        refreshSecret: config.get<string>('JWT_REFRESH_SECRET', DEV_DEFAULTS.refreshSecret),
        refreshExpiresIn: config.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          DEV_DEFAULTS.refreshExpiresIn,
        ),
      },
      storage: {
        driver: (config.get<string>('STORAGE_DRIVER', 'local') === 's3' ? 's3' : 'local') as
          's3' | 'local',
        endpoint: config.get<string>('STORAGE_ENDPOINT', ''),
        accessKey: config.get<string>('STORAGE_ACCESS_KEY', ''),
        secretKey: config.get<string>('STORAGE_SECRET_KEY', ''),
        bucket: config.get<string>('STORAGE_BUCKET', 'erp-dev'),
        region: config.get<string>('STORAGE_REGION', 'us-east-1'),
        localDir: config.get<string>('STORAGE_LOCAL_DIR', './storage'),
      },
    };
  }
}

export { EnvConfig };
