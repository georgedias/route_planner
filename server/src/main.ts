import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173'

  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: webOrigin.split(',').map((origin) => origin.trim()), credentials: true })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const port = Number(process.env.PORT || 3000)
  await app.listen(port, '0.0.0.0')
}

void bootstrap()
