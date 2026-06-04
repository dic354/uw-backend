import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });

  // Validaci贸n global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Configuraci贸n de Swagger
  const config = new DocumentBuilder()
    .setTitle('UrbanWear API')
    .setDescription('API REST para la tienda online de moda urbana UrbanWear')
    .setVersion('1.0')
    .addBearerAuth(
      {
        // Configuraci贸n del token JWT en Swagger
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Introduce el token JWT obtenido en /auth/login',
      },
      'JWT', // Nombre del esquema de seguridad
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Mantiene el token al recargar
    },
  });

  await app.listen(3000);

  console.log('Servidor corriendo en: http://localhost:3000');
  console.log('Documentaci贸n Swagger: http://localhost:3000/api');
}
bootstrap();