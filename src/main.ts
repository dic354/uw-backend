import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:4200',
      'https://urbanwearshop.vercel.app', 
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('UrbanWear API')
    .setDescription('API REST para la tienda online de moda urbana UrbanWear')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Introduce el token JWT obtenido en /auth/login',
      },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`Servidor corriendo en el puerto: ${port}`);
  console.log(`Documentación Swagger: http://localhost:${port}/api`);
}
bootstrap();