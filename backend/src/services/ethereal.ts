import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | null = null;
let generatedAccount: { user: string; pass: string } | null = null;

export async function getTransporter() {
  if (transporter) return transporter;

  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    transporter = nodemailer.createTransport({
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: env.ETHEREAL_PORT === 465,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      auth: { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS }
    });
    return transporter;
  }

  const account = await nodemailer.createTestAccount();
  generatedAccount = { user: account.user, pass: account.pass };
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: { user: account.user, pass: account.pass }
  });
  console.log(`Ethereal test account: ${account.user}`);
  return transporter;
}

export async function sendEmail(args: { from: string; to: string; subject: string; html: string; messageId?: string; attachments?: Array<{ filename: string; contentType: string; contentBase64: string }> }) {
  const tx = await getTransporter();
  const info = await tx.sendMail({
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.html.replace(/<[^>]*>/g, ' '),
    attachments: args.attachments?.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(attachment.contentBase64, 'base64')
    })),
    ...(args.messageId ? { messageId: args.messageId } : {})
  });
  if (!Array.isArray(info.accepted) || info.accepted.length === 0) {
    throw new Error(`SMTP server did not accept recipient ${args.to}.`);
  }
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: typeof previewUrl === 'string' ? previewUrl : undefined };
}

export function getGeneratedAccount() { return generatedAccount; }
