import type { SmsProvider } from './ISmsProvider';
import { MockSmsProvider } from './MockSmsProvider';
import { env } from '../../../config/env';

let instance: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (instance) return instance;
  switch (env.SMS_PROVIDER) {
    case 'mock':
      instance = new MockSmsProvider();
      break;
    // case 'twilio': instance = new TwilioSmsProvider(); break;
    // case 'msg91':  instance = new Msg91SmsProvider();  break;
    // case 'fast2sms': instance = new Fast2SmsProvider(); break;
    default:
      instance = new MockSmsProvider();
  }
  return instance;
}
