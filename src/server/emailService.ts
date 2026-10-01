import React from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { AuctionEmailTemplate, AuctionEmailProps, EmailType } from '../emails/AuctionEmailTemplate';

let resendClient: Resend | null = null;

export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[EMAIL] RESEND_API_KEY environment variable is not configured. Email will be logged to console.');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export function getBaseAppUrl(): string {
  const configured = process.env.APP_URL || process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !configured.includes('drazbenik.si')) {
    return configured;
  }
  return 'https://drazbe.eu';
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM || 'dražbenik.si <obvestila@drazbenik.si>';
}

/**
 * Send an auction email using React Email template and Resend
 */
export async function sendAuctionEmail(
  to: string,
  subject: string,
  templateProps: AuctionEmailProps
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!to || !to.includes('@')) {
    console.warn(`[EMAIL] Invalid recipient email: ${to}`);
    return { success: false, error: 'Invalid recipient email' };
  }

  try {
    const html = await render(React.createElement(AuctionEmailTemplate, templateProps));
    const resend = getResend();
    const from = getEmailFrom();

    if (!resend) {
      console.log(`[EMAIL SIMULATION] To: ${to} | Subject: "${subject}" | Type: ${templateProps.type}`);
      return { success: true, id: 'simulated_' + Date.now() };
    }

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed to send email to ${to}:`, error);
      return { success: false, error: error.message };
    }

    console.log(`[EMAIL SENT] Successfully sent ${templateProps.type} email to ${to}, ID: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error(`[EMAIL EXCEPTION] Error sending email to ${to}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Triggered when a bidder is outbid by another user
 */
export async function sendOutbidNotification(params: {
  toEmail: string;
  recipientName?: string;
  auctionId: string;
  auctionTitle: string;
  auctionImageUrl?: string;
  newPrice: number;
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getBaseAppUrl();
  const auctionUrl = `${baseUrl}/?drazba=${params.auctionId}`;

  const subject = `⚠️ Presežena ponudba: ${params.auctionTitle} - dražbenik.si`;

  return sendAuctionEmail(params.toEmail, subject, {
    type: 'outbid',
    recipientName: params.recipientName || 'Spoštovani uporabnik',
    auctionTitle: params.auctionTitle,
    auctionImageUrl: params.auctionImageUrl,
    currentPrice: params.newPrice,
    auctionUrl,
    settingsUrl: `${baseUrl}/?tab=settings`,
  });
}

/**
 * Triggered 30 minutes before auction ends
 */
export async function sendEndingSoonNotification(params: {
  toEmail: string;
  recipientName?: string;
  auctionId: string;
  auctionTitle: string;
  auctionImageUrl?: string;
  currentPrice: number;
  endTimeFormatted?: string;
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getBaseAppUrl();
  const auctionUrl = `${baseUrl}/?drazba=${params.auctionId}`;

  const subject = `⏳ Kmalu se izteče: ${params.auctionTitle} - dražbenik.si`;

  return sendAuctionEmail(params.toEmail, subject, {
    type: 'ending_soon',
    recipientName: params.recipientName || 'Spoštovani uporabnik',
    auctionTitle: params.auctionTitle,
    auctionImageUrl: params.auctionImageUrl,
    currentPrice: params.currentPrice,
    endTime: params.endTimeFormatted || 'manj kot 30 minut',
    auctionUrl,
    settingsUrl: `${baseUrl}/?tab=settings`,
  });
}

/**
 * Triggered when auction concludes and user is the winner
 */
export async function sendAuctionWonNotification(params: {
  toEmail: string;
  recipientName?: string;
  auctionId: string;
  auctionTitle: string;
  auctionImageUrl?: string;
  winningPrice: number;
  paymentDeadlineFormatted?: string;
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getBaseAppUrl();
  const auctionUrl = `${baseUrl}/?drazba=${params.auctionId}`;
  const paymentUrl = `${baseUrl}/?tab=winnings&pay=${params.auctionId}`;

  const subject = `🏆 Čestitamo! Zmagali ste na dražbi: ${params.auctionTitle} - dražbenik.si`;

  return sendAuctionEmail(params.toEmail, subject, {
    type: 'won',
    recipientName: params.recipientName || 'Zmagovalec',
    auctionTitle: params.auctionTitle,
    auctionImageUrl: params.auctionImageUrl,
    currentPrice: params.winningPrice,
    paymentDeadline: params.paymentDeadlineFormatted || '48 ur',
    auctionUrl,
    paymentUrl,
    settingsUrl: `${baseUrl}/?tab=settings`,
  });
}

/**
 * Triggered 2 hours before 48h payment deadline expires
 */
export async function sendPaymentReminderNotification(params: {
  toEmail: string;
  recipientName?: string;
  auctionId: string;
  auctionTitle: string;
  auctionImageUrl?: string;
  amount: number;
  paymentDeadlineFormatted?: string;
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getBaseAppUrl();
  const auctionUrl = `${baseUrl}/?drazba=${params.auctionId}`;
  const paymentUrl = `${baseUrl}/?tab=winnings&pay=${params.auctionId}`;

  const subject = `⏰ Zadnji opomnik za plačilo: ${params.auctionTitle} - dražbenik.si`;

  return sendAuctionEmail(params.toEmail, subject, {
    type: 'payment_reminder',
    recipientName: params.recipientName || 'Spoštovani kupec',
    auctionTitle: params.auctionTitle,
    auctionImageUrl: params.auctionImageUrl,
    currentPrice: params.amount,
    paymentDeadline: params.paymentDeadlineFormatted || 'manj kot 2 uri',
    auctionUrl,
    paymentUrl,
    settingsUrl: `${baseUrl}/?tab=settings`,
  });
}

/**
 * Triggered 24 hours after buyer receipt confirmation if review is not yet submitted
 */
export async function sendReviewReminderNotification(params: {
  toEmail: string;
  recipientName?: string;
  auctionId: string;
  auctionTitle: string;
  auctionImageUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = getBaseAppUrl();
  const auctionUrl = `${baseUrl}/?drazba=${params.auctionId}`;
  const reviewUrl = `${baseUrl}/?tab=winnings`;

  const subject = `⭐ Kako ste zadovoljni z nakupom: ${params.auctionTitle}? - dražbenik.si`;

  return sendAuctionEmail(params.toEmail, subject, {
    type: 'review_reminder',
    recipientName: params.recipientName || 'Spoštovani kupec',
    auctionTitle: params.auctionTitle,
    auctionImageUrl: params.auctionImageUrl,
    currentPrice: 0,
    auctionUrl,
    paymentUrl: reviewUrl,
    settingsUrl: `${baseUrl}/?tab=settings`,
  });
}

