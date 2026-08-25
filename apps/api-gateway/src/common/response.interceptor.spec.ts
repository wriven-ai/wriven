import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps the handler result in { success: true, data }', (done) => {
    const interceptor = new ResponseInterceptor();
    interceptor
      .intercept(undefined as never, { handle: () => of({ hello: 'world' }) })
      .subscribe((value) => {
        expect(value).toEqual({ success: true, data: { hello: 'world' } });
        done();
      });
  });

  it('preserves falsy data values (null, 0, false)', (done) => {
    const interceptor = new ResponseInterceptor();
    interceptor
      .intercept(undefined as never, { handle: () => of(null) })
      .subscribe((value) => {
        expect(value).toEqual({ success: true, data: null });
        done();
      });
  });
});
