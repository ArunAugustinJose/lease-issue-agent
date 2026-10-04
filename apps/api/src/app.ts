import 'reflect-metadata';
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Allow, IsIn, IsString, MaxLength } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { UnitsService } from './units';
import { LeasesService } from './leases';
import { IssuesService } from './issues';
import { FilesService } from './files';
import {
  UnitsModule,
  LeasesModule,
  IssuesModule,
  StorageModule,
} from './modules';
import type { ReviewStatus, Value } from '@marina/contracts';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { uploadRoot } from './storage';
export class ReviewDto {
  @ApiProperty({ type: String, enum: ['ACCEPTED', 'REJECTED'] })
  @IsIn(['ACCEPTED', 'REJECTED'])
  status!: ReviewStatus;
}
export class FieldReviewDto extends ReviewDto {
  @ApiProperty({
    type: String,
    required: false,
    description:
      'Optional corrected scalar value. Accept preserves original extraction.',
  })
  @Allow()
  value?: Value;
}
export class IssueDto {
  @ApiProperty({ type: String, example: 'MC-B-1204' })
  @IsString()
  @MaxLength(100)
  unitId!: string;
}
const pipe = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
const limits = { fileSize: 10 * 1024 * 1024, files: 8, fields: 3, parts: 12 };
@ApiTags('Owner workspace')
@Controller()
export class OwnerController {
  constructor(
    @Inject(UnitsService) private readonly unitsService: UnitsService,
    @Inject(LeasesService) private readonly leasesService: LeasesService,
    @Inject(IssuesService) private readonly issuesService: IssuesService,
    @Inject(FilesService) private readonly filesService: FilesService,
  ) {}
  @Get('health') health() {
    return { status: 'ok', provider: 'stub' };
  }
  @Get('units') units() {
    return this.unitsService.units();
  }
  @Get('units/:id') unit(@Param('id') id: string) {
    return this.unitsService.unit(id);
  }
  @Post('leases')
  @ApiOperation({
    summary: 'Upload a lease; extraction is pending owner review',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { ...limits, files: 1 } }))
  uploadLease(@UploadedFile() file: Express.Multer.File) {
    return this.leasesService.uploadLease(file);
  }
  @Get('leases/:id') lease(@Param('id') id: string) {
    return this.leasesService.lease(id);
  }
  @Get('leases/:id/validations') async validations(@Param('id') id: string) {
    return (await this.leasesService.lease(id)).validations;
  }
  @Patch('leases/:id/fields/:fieldId')
  @ApiBody({ type: FieldReviewDto })
  reviewField(
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body(pipe(FieldReviewDto)) body: FieldReviewDto,
  ) {
    if (
      body.value !== undefined &&
      body.value !== null &&
      !['string', 'number', 'boolean'].includes(typeof body.value)
    )
      throw new HttpException(
        'Corrected value must be text, a number, a boolean or null.',
        400,
      );
    return this.leasesService.reviewField(id, fieldId, body.status, body.value);
  }
  @Patch('leases/:id/flags/:flagId')
  @ApiBody({ type: ReviewDto })
  reviewFlag(
    @Param('id') id: string,
    @Param('flagId') flagId: string,
    @Body(pipe(ReviewDto)) body: ReviewDto,
  ) {
    return this.leasesService.reviewFlag(id, flagId, body.status);
  }
  @Post('issues')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['unitId', 'photos'],
      properties: {
        unitId: { type: 'string' },
        photos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('photos', 8, { limits }))
  issue(
    @Body(pipe(IssueDto)) body: IssueDto,
    @UploadedFiles() photos: Express.Multer.File[],
  ) {
    return this.issuesService.createIssue(body.unitId, photos);
  }
  @Get('issues/:id') getIssue(@Param('id') id: string) {
    return this.issuesService.issue(id);
  }
  @Patch('work-orders/:id')
  @ApiBody({ type: ReviewDto })
  reviewOrder(@Param('id') id: string, @Body(pipe(ReviewDto)) body: ReviewDto) {
    return this.issuesService.reviewWorkOrder(id, body.status);
  }
  @Get('files/:key')
  async file(@Param('key') key: string, @Res() res: Response) {
    const file = await this.filesService.file(key);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${file.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.sendFile(resolve(uploadRoot(), key), (error) => {
      if (error && !res.headersSent)
        res.status(404).json({
          statusCode: 404,
          message: 'File no longer available.',
          code: 'FILE_NOT_FOUND',
        });
    });
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    let message =
      'Something went wrong while processing your request. Please try again.';
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const detail =
        typeof response === 'string'
          ? response
          : (response as { message?: string | string[] }).message;
      message = Array.isArray(detail) ? detail.join('; ') : (detail ?? message);
    }
    if (status >= 500) console.error(exception);
    res.status(status).json({
      statusCode: status,
      code:
        status === 413
          ? 'UPLOAD_TOO_LARGE'
          : status >= 500
            ? 'PROCESSING_FAILED'
            : 'REQUEST_FAILED',
      message,
    });
  }
}
@Module({
  imports: [UnitsModule, LeasesModule, IssuesModule, StorageModule],
  controllers: [OwnerController],
})
export class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH'],
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Marina Crest Owner API')
      .setDescription(
        'Stub agents, source evidence and persistent owner review. No authentication; local assessment use.',
      )
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  app.enableShutdownHooks();
  return app;
}
