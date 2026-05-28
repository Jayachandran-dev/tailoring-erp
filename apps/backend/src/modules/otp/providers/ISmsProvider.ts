export interface SmsProvider {
  readonly name: string;
  /**
   * Send an OTP code to the given mobile.
   * Implementations MUST never log the raw code in production.
   */
  sendOtp(mobile: string, code: string): Promise<void>;
}
