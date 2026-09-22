// src/services/emailService.ts

import nodemailer from "nodemailer";
import {
  getWelcomeEmailHtml,
  getWelcomeEmailText,
  getInactivity3DayEmailHtml,
  getInactivity3DayEmailText,
  getInactivity7DayEmailHtml,
  getInactivity7DayEmailText,
} from "../templates/emails.js";

// Initialize Nodemailer transporter
const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("⚠️ SMTP credentials missing. Email service will be disabled.");
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const transporter = createTransporter();
const getFromAddress = () => process.env.SMTP_FROM || '"FoodCanvas" <hello@foodcanvas.com>';

export const sendWelcomeEmail = async (email: string, name: string) => {
  if (!transporter) return false;

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject: "Welcome to FoodCanvas — Cook, Share, Nourish 🍽️",
      text: getWelcomeEmailText(name),
      html: getWelcomeEmailHtml(name),
    });
    console.log(`[Email Service] Welcome email sent to ${email}`);
    return true;
  } catch (error: any) {
    console.error(`[Email Service] Failed to send welcome email to ${email}:`, error?.message || "Unknown error");
    return false; // Do not throw error so registration isn't blocked
  }
};

export const sendInactivityReminderEmail = async (
  email: string,
  name: string,
  stage: 1 | 2
) => {
  if (!transporter) return false;

  const subject =
    stage === 1
      ? "We miss you at FoodCanvas 👋"
      : "Your FoodCanvas journey is waiting for you 🍽️";

  const text =
    stage === 1 ? getInactivity3DayEmailText(name) : getInactivity7DayEmailText(name);

  const html =
    stage === 1 ? getInactivity3DayEmailHtml(name) : getInactivity7DayEmailHtml(name);

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      text,
      html,
    });
    console.log(`[Email Service] Inactivity email (Stage ${stage}) sent to ${email}`);
    return true;
  } catch (error: any) {
    console.error(`[Email Service] Failed to send inactivity email (Stage ${stage}) to ${email}:`, error?.message || "Unknown error");
    return false;
  }
};
