import { Logger } from '@nestjs/common';
import { NEVER, of, throwError } from 'rxjs';
import { AiController } from './ai.controller';
import type { ServiceError } from '@wriven/contracts';

beforeAll(() => {
  Logger.overrideLogger([]);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeController(sendResult: unknown = of({ ok: true })) {
  const send = jest.fn(() => sendResult);
  const core = { send } as never;
  return { controller: new AiController(core), send };
}

const user = { userId: 'u1', email: 'a@b.c' } as never;

describe('AiController.generate — payload + identity injection', () => {
  it('forwards the dto with workspace/project/user pinned from guards (never the body)', async () => {
    const { controller, send } = makeController();
    const dto = { requestId: 'req-1', contentTypeId: 'ct-1', targetKind: 'field', fieldKey: 'body', intent: 'generate' };

    await controller.generate(user, 'ws-1', 'p1', dto as never);

    expect(send).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto,
    });
  });

  it('a downstream ServiceError passes through VERBATIM (no leak rewrite)', async () => {
    const downstream: ServiceError = {
      code: 'PLAN_LIMIT_REACHED',
      message: 'Your plan allows 5 AI generations per month.',
      statusCode: 403,
    };
    const { controller } = makeController(throwError(() => downstream));

    await expect(
      controller.generate(user, 'ws-1', 'p1', { requestId: 'r' } as never),
    ).rejects.toBe(downstream); // the exact object — message and code untouched
  });
});

describe('AiController.generate — the 40s backstop', () => {
  it('a wedged core call rejects with the leak-free AI_TIMEOUT_ERROR envelope', async () => {
    jest.useFakeTimers();
    const { controller } = makeController(NEVER); // never completes, never errors

    const pending = controller.generate(user, 'ws-1', 'p1', { requestId: 'r' } as never);
    // Resolve the microtask chain, then burn past the 40s deadline.
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
      message: 'AI generation failed.',
      statusCode: expect.any(Number),
    });
    await jest.advanceTimersByTimeAsync(40_001);
    await assertion;
  });
});

describe('AiController.readProfile / updateProfile', () => {
  it('profile read: projectId-only payload', async () => {
    const { controller, send } = makeController(of({ brandVoice: null }));

    await controller.readProfile('p1');

    expect(send).toHaveBeenCalledWith(expect.anything(), { projectId: 'p1' });
  });

  it('profile read timeout → GATEWAY_TIMEOUT (504, not the generation envelope)', async () => {
    jest.useFakeTimers();
    const { controller } = makeController(NEVER);

    const pending = controller.readProfile('p1');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'GATEWAY_TIMEOUT' });
    await jest.advanceTimersByTimeAsync(8_001);
    await assertion;
  });

  it('profile update: workspace comes from the PROJECT record, not the client header', async () => {
    const { controller, send } = makeController(of({ brandVoice: 'x' }));

    await controller.updateProfile(user, 'ws-from-project', 'p1', { brandVoice: 'x' } as never);

    expect(send).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'ws-from-project',
      projectId: 'p1',
      userId: 'u1',
      dto: { brandVoice: 'x' },
    });
  });
});
