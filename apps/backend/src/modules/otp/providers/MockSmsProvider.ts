import type { SmsProvider } from './ISmsProvider';
import { logger } from '../../../config/logger';

// Dev-only provider: prints the OTP to the server console. The OTP service
// also returns the code in the HTTP response when OTP_EXPOSE_IN_RESPONSE=true
// so you can test without an SMS account.

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  async sendOtp(mobile: string, code: string): Promise<void> {
    logger.info({ mobile, code }, '[MOCK SMS] OTP issued');
  }
}
