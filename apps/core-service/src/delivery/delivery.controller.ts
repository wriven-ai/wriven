import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CORE_PATTERNS, DeliveryQueryDto } from '@wriven/contracts';
import { DeliveryService } from './delivery.service';

@Controller()
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @MessagePattern(CORE_PATTERNS.DELIVERY_LIST)
  list(
    @Payload() p: { projectId: string; apiId: string; query: DeliveryQueryDto },
  ) {
    return this.delivery.list(p);
  }

  @MessagePattern(CORE_PATTERNS.DELIVERY_GET)
  get(
    @Payload()
    p: { projectId: string; apiId: string; slug: string; query: DeliveryQueryDto },
  ) {
    return this.delivery.get(p);
  }
}
