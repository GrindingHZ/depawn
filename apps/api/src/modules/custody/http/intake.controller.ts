import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  issueReceiptRequestSchema,
  patchIntakeRequestSchema,
  recordAppraisalRequestSchema,
} from '@depawn/contracts';
import type {
  EvidenceItemDto,
  IntakeResponse,
  IssueReceiptRequest,
  PatchIntakeRequest,
  ReceiptResponse,
  RecordAppraisalRequest,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { maximumPhotographBytes } from '../../../domain/custody/photograph';
import { intakeIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney } from '../../shared/http/money.mapper';
import { Roles } from '../../shared/http/roles.decorator';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { AttachPhotoUseCase } from '../application/attach-photo.use-case';
import { IntakeDetailQuery } from '../application/intake-detail.query';
import { ReceiptPhotographQuery } from '../application/receipt-photograph.query';
import { IssueReceiptUseCase } from '../application/issue-receipt.use-case';
import { RecordAppraisalUseCase } from '../application/record-appraisal.use-case';
import { SealIntakeUseCase } from '../application/seal-intake.use-case';
import { UpdateIntakeUseCase } from '../application/update-intake.use-case';
import { custodyStatusFor, toIntakeResponse, toReceiptResponse } from './custody-response.mapper';

/* The structural slice of a multer file this endpoint reads; the full type
   lives behind the interceptor and its global namespace clashes with the
   Express 5 typings. */
interface UploadedPhoto {
  readonly originalname: string;
  readonly buffer: Buffer;
}

@Controller('intakes')
@Roles('VAULT_STAFF')
export class IntakeController {
  constructor(
    private readonly intakeDetail: IntakeDetailQuery,
    private readonly updateIntake: UpdateIntakeUseCase,
    private readonly attachPhoto: AttachPhotoUseCase,
    private readonly recordAppraisal: RecordAppraisalUseCase,
    private readonly sealIntake: SealIntakeUseCase,
    private readonly issueReceipt: IssueReceiptUseCase,
    private readonly photographs: ReceiptPhotographQuery,
  ) {}

  @Get(':intakeId')
  async read(@Param('intakeId') intakeId: string): Promise<IntakeResponse> {
    return this.readDetail(intakeId);
  }

  @Patch(':intakeId')
  @UseInterceptors(IdempotencyInterceptor)
  async update(
    @Param('intakeId') intakeId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(patchIntakeRequestSchema)) body: PatchIntakeRequest,
  ): Promise<IntakeResponse> {
    const result = await this.updateIntake.execute({
      intakeId: intakeIdOf(intakeId),
      requestedBy: account.id,
      itemDescription: body.itemDescription,
      serialNumbers: body.serialNumbers,
      sealNumber: body.sealNumber,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return this.readDetail(intakeId);
  }

  /* The limit is declared here as well as in the domain check, because the
     domain check only runs once the bytes are already buffered in this
     process. Multer refuses the stream at the boundary; the domain decides
     whether what arrived is really a photograph. */
  @Post(':intakeId/photos')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: maximumPhotographBytes } }))
  async uploadPhoto(
    @Param('intakeId') intakeId: string,
    @CurrentAccount() account: Account,
    @UploadedFile() file: UploadedPhoto | undefined,
  ): Promise<EvidenceItemDto> {
    if (file === undefined) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_FAILED', message: 'Attach a photo file named photo.' },
      });
    }
    const result = await this.attachPhoto.execute({
      intakeId: intakeIdOf(intakeId),
      requestedBy: account.id,
      fileName: file.originalname,
      bytes: file.buffer,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return result.value;
  }

  @Post(':intakeId/appraisals')
  @UseInterceptors(IdempotencyInterceptor)
  async appraise(
    @Param('intakeId') intakeId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(recordAppraisalRequestSchema)) body: RecordAppraisalRequest,
  ): Promise<IntakeResponse> {
    const result = await this.recordAppraisal.execute({
      intakeId: intakeIdOf(intakeId),
      requestedBy: account.id,
      value: toMoney(body.value),
      method: body.method,
      comparableReferences: body.comparableReferences,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return this.readDetail(intakeId);
  }

  @Post(':intakeId/seal')
  @UseInterceptors(IdempotencyInterceptor)
  async seal(
    @Param('intakeId') intakeId: string,
    @CurrentAccount() account: Account,
  ): Promise<IntakeResponse> {
    const result = await this.sealIntake.execute({
      intakeId: intakeIdOf(intakeId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    return this.readDetail(intakeId);
  }

  @Post(':intakeId/issue-receipt')
  @UseInterceptors(IdempotencyInterceptor)
  async issue(
    @Param('intakeId') intakeId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(issueReceiptRequestSchema)) body: IssueReceiptRequest,
  ): Promise<ReceiptResponse> {
    const result = await this.issueReceipt.execute({
      intakeId: intakeIdOf(intakeId),
      requestedBy: account.id,
      insurancePolicyReference: body.insurancePolicyReference,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, custodyStatusFor(result.error.code));
    }
    // A receipt cannot be issued without evidence, but evidence recorded
    // before uploads were verified carries no type and is not servable.
    const photographed = await this.photographs.whichHavePhotographs([result.value.id]);
    return toReceiptResponse(result.value, photographed.has(result.value.id));
  }

  private async readDetail(intakeId: string): Promise<IntakeResponse> {
    const detail = await this.intakeDetail.read(intakeIdOf(intakeId));
    if (detail === null) {
      throw new NotFoundException();
    }
    return toIntakeResponse(detail.intake, detail.appraisals);
  }
}
