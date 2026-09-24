import { Test } from '@nestjs/testing';
import { DRIZZLE } from '@wriven/database';
import { AppService } from './app.service';

/** A probe that never settles — what a wedged pool looks like from the
 * service's side: the query is accepted and parked, nothing comes back. */
const hang = (): Promise<never> => new Promise(() => undefined);

async function buildService(execute: jest.Mock): Promise<AppService> {
  const moduleRef = await Test.createTestingModule({
    providers: [{ provide: DRIZZLE, useValue: { execute } }, AppService],
  }).compile();
  return moduleRef.get(AppService);
}

describe('AppService', () => {
  let execute: jest.Mock;
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    execute = jest.fn();
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    jest.useRealTimers();
  });

  it('ping reports db up when the probe resolves', async () => {
    execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const service = await buildService(execute);

    await expect(service.ping()).resolves.toMatchObject({
      service: 'auth-service',
      db: 'up',
    });
  });

  it('ping fails fast when the query hangs (db ping timeout)', async () => {
    jest.useFakeTimers();
    execute.mockImplementation(hang);
    const service = await buildService(execute);

    // Attach the rejection handler before advancing — otherwise the flushed
    // microtasks surface it as an unhandled rejection and jest fails the test.
    const expectation = expect(service.ping()).rejects.toThrow('db ping timeout');
    await jest.advanceTimersByTimeAsync(1_500);
    await expectation;
  });

  it('watchdog exits after WEDGE_FAILURE_LIMIT consecutive failed probes', async () => {
    jest.useFakeTimers();
    execute.mockImplementation(hang);
    const service = await buildService(execute);

    service.onModuleInit();
    // A probe started at tick N times out at 30s*N + PING_TIMEOUT_MS, so each
    // advance must cover the trailing probe window to count its failure.
    await jest.advanceTimersByTimeAsync(30_000 * 9 + 1_500);
    expect(exitSpy).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_000 + 1_500);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('watchdog counter resets on a successful probe', async () => {
    jest.useFakeTimers();
    execute.mockImplementation(hang);
    const service = await buildService(execute);

    service.onModuleInit();
    // 3 failures, then the pool recovers, then 9 more — never 10 in a row.
    await jest.advanceTimersByTimeAsync(30_000 * 3 + 1_500);
    execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await jest.advanceTimersByTimeAsync(30_000);
    execute.mockImplementation(hang);
    await jest.advanceTimersByTimeAsync(30_000 * 9 + 1_500);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
