import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Configuration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const config = Configuration.register(configService);

  app.useLogger(['log', 'warn', 'error']);

  app.use(helmet());

  app.setGlobalPrefix('/api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableCors({ origin: config.corsOrigins });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.swagger.enabled && !['production'].includes(config.nodeEnv)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP API')
      .setDescription('Multi-tenant ERP — REST + OpenAPI (plan §16)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document);
  }

  await app.listen(config.port);
  Logger.log(
    `ERP API listening on http://localhost:${config.port}${config.apiPrefix}`,
    'Bootstrap',
  );
}

void bootstrap();
