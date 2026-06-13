import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@wriven/database';
import * as schema from '../db/schema';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/auth-service/.env',
    }),
    DatabaseModule.forRoot({ schema }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
