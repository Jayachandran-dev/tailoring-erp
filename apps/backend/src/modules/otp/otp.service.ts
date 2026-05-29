import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { platformDb } from '../../db/platformClient';
import { env } from '../../config/env';
import { getSmsProvider } from './providers';
import { badRequest, tooMany, unauthorized } from '../../utils/errors';
import { logger } from '../../config/logger';

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'INVITE';

const RESEND_COOLDOWN_SECONDS = 30;
const MAX_REQUESTS_PER_HOUR = 5;

export interface IssuedOtp {
  requestId: string;
  expiresAt: Date;
  /** Only present when OTP_EXPOSE_IN_RESPONSE=true (dev convenience). */
  devCode?: string;
}

export async function issueOtp(mobile: string, purpose: OtpPurpose): Promise<IssuedOtp> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await platformDb.otpRequest.findMany({
    where: { mobile, purpose, createdAt: { gte: oneHourAgo } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    throw tooMany('OTP request limit reached. Try again later.');
  }
  if (recent[0]) {
    const sinceLast = (Date.now() - recent[0].createdAt.getTime()) / 1000;
    if (sinceLast < RESEND_COOLDOWN_SECONDS) {
      throw tooMany(`Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast)}s before requesting another OTP.`);
    }
  }

  const code = generateOtp(env.OTP_LENGTH);
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  const otp = await platformDb.otpRequest.create({
    data: { mobile, purpose, codeHash, expiresAt },
  });

  await getSmsProvider().sendOtp(mobile, code);
  logger.info({ mobile, purpose, requestId: otp.id }, 'OTP issued');

  return {
    requestId: otp.id,
    expiresAt,
    devCode: env.OTP_EXPOSE_IN_RESPONSE ? code : undefined,
  };
}

export async function verifyOtp(params: {
  requestId: string;
  mobile: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<void> {
  const { requestId, mobile, purpose, code } = params;
  const otp = await platformDb.otpRequest.findUnique({ where: { id: requestId } });
  if (!otp) throw badRequest('Invalid OTP request');
  if (otp.mobile !== mobile || otp.purpose !== purpose) throw badRequest('OTP mismatch');
  if (otp.consumedAt) throw badRequest('OTP already used');
  if (otp.expiresAt.getTime() < Date.now()) throw badRequest('OTP expired');
  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw tooMany('Too many failed attempts. Request a new OTP.');
  }

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await platformDb.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw unauthorized('Incorrect OTP');
  }

  await platformDb.otpRequest.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
}

function generateOtp(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}
