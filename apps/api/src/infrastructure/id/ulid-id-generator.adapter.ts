import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { IdGenerator } from '../../domain/shared/id-generator';

/* ULIDs sort by creation time and are safe to expose (docs/02-domain-model.md). */
@Injectable()
export class UlidIdGeneratorAdapter implements IdGenerator {
  generate(): string {
    return ulid();
  }
}
